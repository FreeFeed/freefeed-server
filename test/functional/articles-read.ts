import { beforeEach, describe, it } from 'mocha';
import expect from 'unexpected';

import { dbAdapter } from '../../app/models';
import type { Article, ArticleDbRowContent } from '../../app/models/article';
import type { UUID } from '../../app/support/types';
import cleanDB from '../dbCleaner';
import { createPost } from '../integration/helpers/posts-and-comments';

import {
  authHeaders,
  createMockAttachmentAsync,
  createTestUser,
  goPrivate,
  justCreateGroup,
  performJSONRequest,
} from './functional_test_helper';
import type { UserCtx } from './functional_test_helper';

const content = {
  title: 'Test article',
  digest: 'Test digest',
  body: { blocks: [{ id: 'text', type: 'text', content: 'Hello' }] },
} satisfies ArticleDbRowContent;

describe('Articles API: reading', () => {
  let luna: UserCtx;

  beforeEach(async () => {
    await cleanDB(dbAdapter.database);
    luna = await createTestUser('luna');
  });

  describe('List', () => {
    it('should list only the viewer’s drafts by default, newest first', async () => {
      const mars = await createTestUser('mars');
      const older = await dbAdapter.createArticle({
        author_id: luna.user.id,
        ...content,
        title: 'Older',
      });
      const newer = await dbAdapter.createArticle({
        author_id: luna.user.id,
        ...content,
        title: 'Newer',
      });
      await newer.setTags(['draft']);
      await dbAdapter.createArticle({ author_id: mars.user.id, ...content });
      await dbAdapter
        .database('articles')
        .where({ uid: older.uid })
        .update({
          created_at: new Date('2026-01-01T00:00:00Z'),
        });
      await dbAdapter
        .database('articles')
        .where({ uid: newer.uid })
        .update({
          created_at: new Date('2026-01-02T00:00:00Z'),
        });

      const response = await performJSONRequest<{
        articles: { id: UUID; title: string; tags: string[] }[];
        isLastPage: boolean;
      }>('GET', '/v4/articles', undefined, authHeaders(luna));
      const otherAuthor = await performJSONRequest<{ articles: unknown[] }>(
        'GET',
        '/v4/articles?author=mars',
        undefined,
        authHeaders(luna),
      );
      const anonymous = await performJSONRequest<{ articles: unknown[] }>('GET', '/v4/articles');

      expect(response, 'to satisfy', { __httpCode: 200, isLastPage: true });
      expect(
        response.articles.map(({ id }) => id),
        'to equal',
        [newer.uid, older.uid],
      );
      expect(response.articles[0], 'to satisfy', { title: 'Newer', tags: ['draft'] });
      expect(response.articles[0], 'not to have key', 'body');
      expect(response.articles[0], 'not to have key', 'attachmentIds');
      expect(otherAuthor, 'to satisfy', { __httpCode: 200, articles: [], isLastPage: true });
      expect(anonymous, 'to satisfy', { __httpCode: 200, articles: [], isLastPage: true });
    });

    it('should list only published articles with visible posts before paginating', async () => {
      const mars = await createTestUser('mars');
      const jupiter = await createTestUser('jupiter');
      const lunaArticle = await dbAdapter.createArticle({
        author_id: luna.user.id,
        ...content,
        title: 'Luna public',
      });
      const lunaPost = await createPost(luna.user, 'Luna public post');
      await lunaArticle.setPost(lunaPost.id);

      const jupiterArticle = await dbAdapter.createArticle({
        author_id: jupiter.user.id,
        ...content,
        title: 'Jupiter public',
      });
      const jupiterPost = await createPost(jupiter.user, 'Jupiter public post');
      await jupiterArticle.setPost(jupiterPost.id);

      await goPrivate(mars);
      const marsPrivateArticle = await dbAdapter.createArticle({
        author_id: mars.user.id,
        ...content,
        title: 'Mars private',
      });
      const marsPrivatePost = await createPost(mars.user, 'Mars private post');
      await marsPrivateArticle.setPost(marsPrivatePost.id);

      await dbAdapter
        .database('articles')
        .where({ uid: lunaArticle.uid })
        .update({
          created_at: new Date('2026-01-01T00:00:00Z'),
        });
      await dbAdapter
        .database('articles')
        .where({ uid: jupiterArticle.uid })
        .update({
          created_at: new Date('2026-01-02T00:00:00Z'),
        });
      await dbAdapter
        .database('articles')
        .where({ uid: marsPrivateArticle.uid })
        .update({
          created_at: new Date('2026-01-03T00:00:00Z'),
        });

      const firstPage = await performJSONRequest<{ articles: { id: UUID }[] }>(
        'GET',
        '/v4/articles?published=true&limit=1',
        undefined,
        authHeaders(luna),
      );
      const secondPage = await performJSONRequest<{ articles: { id: UUID }[] }>(
        'GET',
        '/v4/articles?published=true&limit=1&offset=1',
        undefined,
        authHeaders(luna),
      );
      const byAuthor = await performJSONRequest<{ articles: { id: UUID }[] }>(
        'GET',
        '/v4/articles?published=true&author=jupiter',
        undefined,
        authHeaders(luna),
      );
      const anonymous = await performJSONRequest<{ articles: { id: UUID }[] }>(
        'GET',
        '/v4/articles?published=true',
      );
      const privateAuthor = await performJSONRequest<{ articles: { id: UUID }[] }>(
        'GET',
        '/v4/articles?published=true&author=mars',
        undefined,
        authHeaders(mars),
      );

      expect(firstPage, 'to satisfy', {
        __httpCode: 200,
        articles: [{ id: jupiterArticle.uid }],
        isLastPage: false,
      });
      expect(secondPage, 'to satisfy', {
        __httpCode: 200,
        articles: [{ id: lunaArticle.uid }],
        isLastPage: true,
      });
      expect(byAuthor, 'to satisfy', {
        __httpCode: 200,
        articles: [{ id: jupiterArticle.uid }],
        isLastPage: true,
      });
      expect(
        anonymous.articles.map(({ id }) => id),
        'to equal',
        [jupiterArticle.uid, lunaArticle.uid],
      );
      expect(privateAuthor, 'to satisfy', {
        __httpCode: 200,
        articles: [{ id: marsPrivateArticle.uid }],
        isLastPage: true,
      });
    });

    it('should reject an invalid published value', async () => {
      const response = await performJSONRequest('GET', '/v4/articles?published=1');

      expect(response, 'to satisfy', {
        __httpCode: 400,
        err: 'Invalid published value',
      });
    });

    it('should reject an unknown author', async () => {
      const response = await performJSONRequest('GET', '/v4/articles?author=unknown');

      expect(response, 'to satisfy', { __httpCode: 400, err: 'Invalid author' });
    });

    it('should reject a group as an author', async () => {
      await justCreateGroup(luna, 'selenites');

      const response = await performJSONRequest('GET', '/v4/articles?author=selenites');

      expect(response, 'to satisfy', { __httpCode: 400, err: 'Invalid author' });
    });
  });

  describe('Get by ID', () => {
    let article: Article;

    beforeEach(async () => {
      article = await dbAdapter.createArticle({ author_id: luna.user.id, ...content });
    });

    it('should return the author’s unpublished article by UUID', async () => {
      const response = await performJSONRequest(
        'GET',
        `/v4/articles/${article.uid}`,
        undefined,
        authHeaders(luna),
      );

      expect(response, 'to satisfy', {
        __httpCode: 200,
        article: {
          id: article.uid,
          authorId: luna.user.id,
          postId: null,
          shortId: await article.getShortId(),
          version: 1,
          ...content,
          tags: [],
          attachmentIds: [],
        },
        posts: [],
        attachments: [],
        users: [{ id: luna.user.id }],
      });
    });

    it('should return the article by short ID', async () => {
      const response = await performJSONRequest(
        'GET',
        `/v4/articles/${await article.getShortId()}`,
        undefined,
        authHeaders(luna),
      );

      expect(response, 'to satisfy', { __httpCode: 200, article: { id: article.uid } });
    });

    it('should include article attachments', async () => {
      const attachment = await createMockAttachmentAsync(luna);
      const mediaArticle = await dbAdapter.createArticle({
        author_id: luna.user.id,
        ...content,
        body: { blocks: [{ id: 'media', type: 'media', attachmentId: attachment.id }] },
      });

      const response = await performJSONRequest(
        'GET',
        `/v4/articles/${mediaArticle.uid}`,
        undefined,
        authHeaders(luna),
      );

      expect(response, 'to satisfy', {
        __httpCode: 200,
        article: { id: mediaArticle.uid, attachmentIds: [attachment.id] },
        attachments: [{ id: attachment.id, createdBy: luna.user.id }],
      });
    });

    it('should return 404 for an unknown article', async () => {
      const response = await performJSONRequest(
        'GET',
        '/v4/articles/00000000-0000-0000-0000-000000000000',
        undefined,
        authHeaders(luna),
      );

      expect(response, 'to satisfy', { __httpCode: 404, err: 'Article not found' });
    });

    it('should deny access to another author’s unpublished article', async () => {
      const mars = await createTestUser('mars');
      const response = await performJSONRequest(
        'GET',
        `/v4/articles/${article.uid}`,
        undefined,
        authHeaders(mars),
      );

      expect(response, 'to satisfy', { __httpCode: 403 });
    });

    it('should deny anonymous access to an unpublished article', async () => {
      const response = await performJSONRequest('GET', `/v4/articles/${article.uid}`);

      expect(response, 'to satisfy', { __httpCode: 403 });
    });

    it('should return the associated public post to another user', async () => {
      const mars = await createTestUser('mars');
      const post = await createPost(luna.user, 'Public post');
      await article.setPost(post.id);

      const response = await performJSONRequest(
        'GET',
        `/v4/articles/${article.uid}`,
        undefined,
        authHeaders(mars),
      );

      expect(response, 'to satisfy', {
        __httpCode: 200,
        article: { id: article.uid, postId: post.id },
        posts: [{ id: post.id }],
        users: [{ id: luna.user.id }],
      });
    });

    it('should allow anonymous access when the associated post is public', async () => {
      const post = await createPost(luna.user, 'Public post');
      await article.setPost(post.id);

      const response = await performJSONRequest('GET', `/v4/articles/${article.uid}`);

      expect(response, 'to satisfy', {
        __httpCode: 200,
        article: { id: article.uid, postId: post.id },
        posts: [{ id: post.id }],
      });
    });

    it('should hide a deactivated article', async () => {
      await article.deactivate();

      const response = await performJSONRequest(
        'GET',
        `/v4/articles/${article.uid}`,
        undefined,
        authHeaders(luna),
      );

      expect(response, 'to satisfy', { __httpCode: 404, err: 'Article not found' });
    });
  });

  describe('Revisions', () => {
    let article: Article;

    beforeEach(async () => {
      article = await dbAdapter.createArticle({ author_id: luna.user.id, ...content });
      await article.update(1, { ...content, title: 'Second version' });
      await article.update(2, { ...content, title: 'Third version' });
    });

    it('should return paginated revision IDs and dates', async () => {
      const revisions = await article.getRevisions(10, 0);
      const firstPage = await performJSONRequest(
        'GET',
        `/v4/articles/${article.uid}/revisions?limit=1`,
        undefined,
        authHeaders(luna),
      );
      const secondPage = await performJSONRequest(
        'GET',
        `/v4/articles/${article.uid}/revisions?limit=1&offset=1`,
        undefined,
        authHeaders(luna),
      );

      expect(firstPage, 'to equal', {
        __httpCode: 200,
        revisions: [{ id: revisions[0].uid, createdAt: revisions[0].createdAt.toISOString() }],
        isLastPage: false,
      });
      expect(secondPage, 'to equal', {
        __httpCode: 200,
        revisions: [{ id: revisions[1].uid, createdAt: revisions[1].createdAt.toISOString() }],
        isLastPage: true,
      });
    });

    it('should limit a page to 100 revisions', async () => {
      for (let expectedVersion = 3; expectedVersion <= 101; expectedVersion++) {
        // Updates must be sequential because each one requires the previous version.
        // eslint-disable-next-line no-await-in-loop
        await article.update(expectedVersion, {
          ...content,
          title: `Version ${expectedVersion + 1}`,
        });
      }

      const response = await performJSONRequest<{
        revisions: unknown[];
        isLastPage: boolean;
      }>('GET', `/v4/articles/${article.uid}/revisions?limit=101`, undefined, authHeaders(luna));

      expect(response, 'to satisfy', { __httpCode: 200, isLastPage: false });
      expect(response.revisions, 'to have length', 100);
    });

    it('should return the full revision', async () => {
      const attachment = await createMockAttachmentAsync(luna);
      const mediaContent = {
        ...content,
        title: 'Version with attachment',
        body: { blocks: [{ id: 'media', type: 'media', attachmentId: attachment.id }] },
      } satisfies ArticleDbRowContent;
      const mediaArticle = await dbAdapter.createArticle({
        author_id: luna.user.id,
        ...mediaContent,
      });
      await mediaArticle.update(1, content);
      const [revision] = await mediaArticle.getRevisions(1, 0);

      const response = await performJSONRequest(
        'GET',
        `/v4/articles/${mediaArticle.uid}/revisions/${revision.uid}`,
        undefined,
        authHeaders(luna),
      );

      expect(response, 'to satisfy', {
        __httpCode: 200,
        revision: {
          id: revision.uid,
          articleId: mediaArticle.uid,
          version: 1,
          title: mediaContent.title,
          digest: mediaContent.digest,
          body: mediaContent.body,
          createdAt: revision.createdAt.toISOString(),
          attachmentIds: [attachment.id],
        },
        attachments: [{ id: attachment.id }],
      });
      expect(Object.keys(response).sort(), 'to equal', ['__httpCode', 'attachments', 'revision']);
    });

    it('should not return a revision of another article', async () => {
      const otherArticle = await dbAdapter.createArticle({
        author_id: luna.user.id,
        ...content,
      });
      await otherArticle.update(1, { ...content, title: 'Other version' });
      const [otherRevision] = await otherArticle.getRevisions(1, 0);

      const response = await performJSONRequest(
        'GET',
        `/v4/articles/${article.uid}/revisions/${otherRevision.uid}`,
        undefined,
        authHeaders(luna),
      );

      expect(response, 'to satisfy', {
        __httpCode: 404,
        err: 'Article revision not found',
      });
    });

    it('should not return revisions to another user', async () => {
      const mars = await createTestUser('mars');
      const post = await createPost(luna.user, 'Public post');
      await article.setPost(post.id);
      const [revision] = await article.getRevisions(1, 0);

      const listResponse = await performJSONRequest(
        'GET',
        `/v4/articles/${article.uid}/revisions`,
        undefined,
        authHeaders(mars),
      );
      const revisionResponse = await performJSONRequest(
        'GET',
        `/v4/articles/${article.uid}/revisions/${revision.uid}`,
        undefined,
        authHeaders(mars),
      );

      expect(listResponse, 'to satisfy', { __httpCode: 403 });
      expect(revisionResponse, 'to satisfy', { __httpCode: 403 });
    });
  });
});
