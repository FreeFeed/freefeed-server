import { afterEach, before, beforeEach, describe, it } from 'mocha';
import expect from 'unexpected';

import { getSingleton } from '../../app/app';
import { dbAdapter, PubSub } from '../../app/models';
import type { Article, ArticleDbRowContent } from '../../app/models/article';
import { DummyPublisher } from '../../app/pubsub';
import { connect as redisConnection } from '../../app/setup/database';
import { eventNames, PubSubAdapter } from '../../app/support/PubSubAdapter';
import type { UUID } from '../../app/support/types';
import { UNDO_ARTICLE_DELETE, UndoArticleDelete } from '../../app/support/undo/article-delete';
import cleanDB from '../dbCleaner';
import { createPost } from '../integration/helpers/posts-and-comments';

import {
  authHeaders,
  createMockAttachmentAsync,
  createTestUser,
  performJSONRequest,
} from './functional_test_helper';
import type { UserCtx } from './functional_test_helper';
import Session from './realtime-session';

const content = {
  title: 'Test article',
  digest: 'Test digest',
  body: { blocks: [{ id: 'text', type: 'text', content: 'Hello' }] },
} satisfies ArticleDbRowContent;

describe('Articles API', () => {
  let luna: UserCtx;

  beforeEach(async () => {
    await cleanDB(dbAdapter.database);
    luna = await createTestUser('luna');
  });

  it('should create and serialize an article with an attachment', async () => {
    const attachment = await createMockAttachmentAsync(luna);
    const articleContent = {
      ...content,
      tags: ['First', 'Second', 'FIRST'],
      body: {
        blocks: [
          ...content.body.blocks,
          { id: 'media', type: 'media', attachmentId: attachment.id },
        ],
      },
    };

    const response = await performJSONRequest<{ article: { id: UUID } }>(
      'POST',
      '/v4/articles',
      articleContent,
      authHeaders(luna),
    );

    expect(response, 'to satisfy', {
      __httpCode: 200,
      article: {
        id: expect.it('to be a string'),
        authorId: luna.user.id,
        postId: null,
        shortId: expect.it('to be a string'),
        version: 1,
        title: articleContent.title,
        digest: articleContent.digest,
        body: articleContent.body,
        createdAt: expect.it('to be a string'),
        updatedAt: expect.it('to be a string'),
        tags: ['first', 'second'],
        attachmentIds: [attachment.id],
      },
      attachments: [{ id: attachment.id, createdBy: luna.user.id, postId: null }],
      users: [{ id: luna.user.id }],
    });

    const { id } = response.article;
    expect(await dbAdapter.getArticleById(id), 'to satisfy', {
      authorId: luna.user.id,
      version: 1,
      body: articleContent.body,
    });
    expect(await dbAdapter.getAttachmentById(attachment.id), 'to satisfy', { articleId: id });
    expect(await (await dbAdapter.getArticleById(id))?.getTags(), 'to equal', ['first', 'second']);
  });

  it('should reject invalid tags without creating an article', async () => {
    const response = await performJSONRequest(
      'POST',
      '/v4/articles',
      { ...content, tags: [''] },
      authHeaders(luna),
    );

    expect(response, 'to satisfy', { __httpCode: 422 });
    expect(await dbAdapter.database('articles'), 'to be empty');
  });

  it('should require tags on creation', async () => {
    const response = await performJSONRequest('POST', '/v4/articles', content, authHeaders(luna));

    expect(response, 'to satisfy', { __httpCode: 422, err: /tags/ });
    expect(await dbAdapter.database('articles'), 'to be empty');
  });

  it('should reject anonymous creation', async () => {
    const response = await performJSONRequest('POST', '/v4/articles', { ...content, tags: [] });

    expect(response, 'to satisfy', { __httpCode: 401 });
    expect(await dbAdapter.database('articles'), 'to be empty');
  });

  it('should reject an invalid body', async () => {
    const response = await performJSONRequest(
      'POST',
      '/v4/articles',
      {
        ...content,
        tags: [],
        body: { blocks: [{ id: 'bad', type: 'media', attachmentId: 'invalid' }] },
      },
      authHeaders(luna),
    );

    expect(response, 'to satisfy', { __httpCode: 422, err: /attachmentId/ });
    expect(await dbAdapter.database('articles'), 'to be empty');
  });

  it('should reject duplicate block IDs', async () => {
    const response = await performJSONRequest(
      'POST',
      '/v4/articles',
      {
        ...content,
        tags: [],
        body: {
          blocks: [...content.body.blocks, { id: 'text', type: 'list', items: ['Other block'] }],
        },
      },
      authHeaders(luna),
    );

    expect(response, 'to satisfy', { __httpCode: 422, err: /Block IDs must be unique/ });
    expect(await dbAdapter.database('articles'), 'to be empty');
  });

  it('should reject a foreign attachment without linking own attachments', async () => {
    const mars = await createTestUser('mars');
    const own = await createMockAttachmentAsync(luna);
    const foreign = await createMockAttachmentAsync(mars);
    const response = await performJSONRequest(
      'POST',
      '/v4/articles',
      {
        ...content,
        tags: [],
        body: {
          blocks: [own.id, foreign.id].map((attachmentId, index) => ({
            id: String(index),
            type: 'media',
            attachmentId,
          })),
        },
      },
      authHeaders(luna),
    );

    expect(response, 'to satisfy', {
      __httpCode: 422,
      err: 'Some article attachments are unavailable',
    });
    expect(await dbAdapter.database('articles'), 'to be empty');
    expect(await dbAdapter.getAttachmentById(own.id), 'to satisfy', { articleId: null });
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

  describe('Detach from post', () => {
    let article: Article;
    let postId: UUID;

    beforeEach(async () => {
      article = await dbAdapter.createArticle({ author_id: luna.user.id, ...content });
      const post = await createPost(luna.user, 'Public post');
      postId = post.id;
      await article.setPost(postId);
    });

    it('should detach the article from its post', async () => {
      const response = await performJSONRequest(
        'DELETE',
        `/v4/articles/${article.uid}/post`,
        undefined,
        authHeaders(luna),
      );

      expect(response, 'to satisfy', {
        __httpCode: 200,
        article: { id: article.uid, postId: null },
      });
      expect(await dbAdapter.getArticleById(article.uid), 'to satisfy', { postId: null });
    });

    it('should not let another user detach the article', async () => {
      const mars = await createTestUser('mars');
      const response = await performJSONRequest(
        'DELETE',
        `/v4/articles/${article.uid}/post`,
        undefined,
        authHeaders(mars),
      );

      expect(response, 'to satisfy', { __httpCode: 403 });
      expect(await dbAdapter.getArticleById(article.uid), 'to satisfy', { postId });
    });

    describe('Realtime', () => {
      let port: string | number;
      let session: Session;

      before(async () => {
        const app = await getSingleton();
        port = process.env.PEPYATKA_SERVER_PORT || app.context.config.port;
      });

      beforeEach(async () => {
        PubSub.setPublisher(new PubSubAdapter(redisConnection()));
        session = await Session.create(port, 'Luna');
        await session.sendAsync('auth', { authToken: luna.authToken });
        const postsTimeline = await luna.user.getPostsTimeline();

        if (!postsTimeline) {
          throw new Error('Posts timeline not found');
        }

        await session.sendAsync('subscribe', { timeline: [postsTimeline.id] });
      });

      afterEach(() => {
        session.disconnect();
        PubSub.setPublisher(new DummyPublisher());
      });

      it(`should publish '${eventNames.POST_UPDATED}' for the detached post`, async () => {
        const event = session.receiveWhile(eventNames.POST_UPDATED, () =>
          performJSONRequest(
            'DELETE',
            `/v4/articles/${article.uid}/post`,
            undefined,
            authHeaders(luna),
          ),
        );

        await expect(event, 'when fulfilled', 'to satisfy', {
          posts: { id: postId, articleId: null },
        });
      });

      it(`should include the article in '${eventNames.POST_CREATED}'`, async () => {
        const unpublishedArticle = await dbAdapter.createArticle({
          author_id: luna.user.id,
          ...content,
        });
        const event = session.receiveWhile(eventNames.POST_CREATED, () =>
          performJSONRequest(
            'POST',
            '/v4/posts',
            {
              post: { body: 'New post', articleId: unpublishedArticle.uid },
              meta: { feeds: [luna.username] },
            },
            authHeaders(luna),
          ),
        );

        await expect(event, 'when fulfilled', 'to satisfy', {
          posts: { articleId: unpublishedArticle.uid },
        });
      });
    });
  });

  describe('Update', () => {
    let article: Article;

    beforeEach(async () => {
      article = await dbAdapter.createArticle({ author_id: luna.user.id, ...content });
    });

    it('should update content, tags, and attachments', async () => {
      const attachment = await createMockAttachmentAsync(luna);
      const updated = {
        title: 'Updated article',
        digest: 'Updated digest',
        body: { blocks: [{ id: 'media', type: 'media', attachmentId: attachment.id }] },
        tags: ['First', 'Second'],
      };

      const response = await performJSONRequest(
        'PUT',
        `/v4/articles/${article.uid}?expectedVersion=1`,
        updated,
        authHeaders(luna),
      );

      expect(response, 'to satisfy', {
        __httpCode: 200,
        article: {
          id: article.uid,
          version: 2,
          title: updated.title,
          digest: updated.digest,
          body: updated.body,
          tags: ['first', 'second'],
          attachmentIds: [attachment.id],
        },
        attachments: [{ id: attachment.id }],
      });
      expect(await dbAdapter.getArticleById(article.uid), 'to satisfy', {
        title: updated.title,
        digest: updated.digest,
        body: updated.body,
        version: 2,
      });
      expect(await article.getRevisions(10, 0), 'to satisfy', [{ version: 1, ...content }]);
      expect(await dbAdapter.getAttachmentById(attachment.id), 'to satisfy', {
        articleId: article.uid,
      });
    });

    it('should update only tags without creating a revision', async () => {
      const response = await performJSONRequest(
        'PUT',
        `/v4/articles/${article.uid}?expectedVersion=1`,
        { ...content, tags: ['New'] },
        authHeaders(luna),
      );

      expect(response, 'to satisfy', {
        __httpCode: 200,
        article: { id: article.uid, version: 1, tags: ['new'] },
      });
      expect(await article.getRevisions(10, 0), 'to be empty');
    });

    it('should reject a stale version without changing the article', async () => {
      const first = { ...content, title: 'First update', tags: ['First'] };
      const second = { ...content, title: 'Second update', tags: ['Second'] };
      const firstResponse = await performJSONRequest(
        'PUT',
        `/v4/articles/${article.uid}?expectedVersion=1`,
        first,
        authHeaders(luna),
      );
      expect(firstResponse, 'to satisfy', { __httpCode: 200, article: { version: 2 } });

      const response = await performJSONRequest(
        'PUT',
        `/v4/articles/${article.uid}?expectedVersion=1`,
        second,
        authHeaders(luna),
      );

      expect(response, 'to satisfy', {
        __httpCode: 409,
        err: 'Article version is mismatched',
      });
      expect(await dbAdapter.getArticleById(article.uid), 'to satisfy', {
        title: first.title,
        version: 2,
      });
      expect(await article.getTags(), 'to equal', ['first']);
      expect(await article.getRevisions(10, 0), 'to have length', 1);
    });

    it('should require the expected version', async () => {
      const response = await performJSONRequest(
        'PUT',
        `/v4/articles/${article.uid}`,
        { ...content, title: 'Updated without a version', tags: [] },
        authHeaders(luna),
      );

      expect(response, 'to satisfy', {
        __httpCode: 400,
        err: 'Invalid expected version',
      });
      expect(await dbAdapter.getArticleById(article.uid), 'to satisfy', {
        title: content.title,
        version: 1,
      });
      expect(await article.getRevisions(10, 0), 'to be empty');
    });

    it('should deny updates by another user', async () => {
      const mars = await createTestUser('mars');
      const response = await performJSONRequest(
        'PUT',
        `/v4/articles/${article.uid}?expectedVersion=1`,
        { ...content, title: 'Unauthorized update', tags: [] },
        authHeaders(mars),
      );

      expect(response, 'to satisfy', { __httpCode: 403 });
      expect(await dbAdapter.getArticleById(article.uid), 'to satisfy', {
        title: content.title,
        version: 1,
      });
      expect(await article.getRevisions(10, 0), 'to be empty');
    });

    it('should reject an invalid body without changing the article', async () => {
      const response = await performJSONRequest(
        'PUT',
        `/v4/articles/${article.uid}?expectedVersion=1`,
        {
          ...content,
          tags: [],
          body: {
            blocks: [...content.body.blocks, { id: 'text', type: 'list', items: ['Duplicate'] }],
          },
        },
        authHeaders(luna),
      );

      expect(response, 'to satisfy', { __httpCode: 422, err: /Block IDs must be unique/ });
      expect(await dbAdapter.getArticleById(article.uid), 'to satisfy', {
        ...content,
        version: 1,
      });
      expect(await article.getRevisions(10, 0), 'to be empty');
    });
  });

  describe('Delete and restore', () => {
    let article: Article;

    beforeEach(async () => {
      article = await dbAdapter.createArticle({ author_id: luna.user.id, ...content });
    });

    it('should soft-delete an article and return an undo token', async () => {
      const response = await performJSONRequest(
        'DELETE',
        `/v4/articles/${article.uid}`,
        undefined,
        authHeaders(luna),
      );

      expect(response, 'to satisfy', {
        __httpCode: 200,
        undo: [
          {
            subject: UNDO_ARTICLE_DELETE,
            message: 'You deleted your article',
            messageParams: {},
            expiresInSec: UndoArticleDelete.ttlSec,
            token: expect.it('to be a string'),
          },
        ],
      });
      expect(await dbAdapter.getArticleById(article.uid), 'to satisfy', {
        toDelete: true,
        version: 1,
      });

      const getResponse = await performJSONRequest(
        'GET',
        `/v4/articles/${article.uid}`,
        undefined,
        authHeaders(luna),
      );
      expect(getResponse, 'to satisfy', { __httpCode: 404, err: 'Article not found' });
    });

    it('should restore an article using its undo token', async () => {
      const deletion = await performJSONRequest<{ undo: [{ token: string }] }>(
        'DELETE',
        `/v4/articles/${article.uid}`,
        undefined,
        authHeaders(luna),
      );
      const [{ token }] = deletion.undo;

      const response = await performJSONRequest(
        'POST',
        `/v4/undo/${UNDO_ARTICLE_DELETE}`,
        { token },
        authHeaders(luna),
      );

      expect(response, 'to satisfy', {
        __httpCode: 200,
        article: { id: article.uid, version: 1, ...content },
      });
      expect(await dbAdapter.getArticleById(article.uid), 'to satisfy', { toDelete: false });
      expect(await article.getRevisions(10, 0), 'to be empty');

      const getResponse = await performJSONRequest(
        'GET',
        `/v4/articles/${article.uid}`,
        undefined,
        authHeaders(luna),
      );
      expect(getResponse, 'to satisfy', { __httpCode: 200, article: { id: article.uid } });
    });

    it('should reject deletion by another user', async () => {
      const mars = await createTestUser('mars');
      const response = await performJSONRequest(
        'DELETE',
        `/v4/articles/${article.uid}`,
        undefined,
        authHeaders(mars),
      );

      expect(response, 'to satisfy', { __httpCode: 403 });
      expect(await dbAdapter.getArticleById(article.uid), 'to satisfy', { toDelete: false });
    });

    it('should return 404 on repeated deletion', async () => {
      const first = await performJSONRequest(
        'DELETE',
        `/v4/articles/${article.uid}`,
        undefined,
        authHeaders(luna),
      );
      expect(first, 'to satisfy', { __httpCode: 200 });

      const second = await performJSONRequest(
        'DELETE',
        `/v4/articles/${article.uid}`,
        undefined,
        authHeaders(luna),
      );
      expect(second, 'to satisfy', { __httpCode: 404, err: 'Article not found' });
    });

    it('should not let another user restore the article', async () => {
      const mars = await createTestUser('mars');
      const deletion = await performJSONRequest<{ undo: [{ token: string }] }>(
        'DELETE',
        `/v4/articles/${article.uid}`,
        undefined,
        authHeaders(luna),
      );
      const [{ token }] = deletion.undo;

      const response = await performJSONRequest(
        'POST',
        `/v4/undo/${UNDO_ARTICLE_DELETE}`,
        { token },
        authHeaders(mars),
      );

      expect(response, 'to satisfy', { __httpCode: 403, err: 'Invalid or expired undo token' });
      expect(await dbAdapter.getArticleById(article.uid), 'to satisfy', { toDelete: true });
    });

    it('should restore an article with a manage-articles app token', async () => {
      const appToken = await dbAdapter.createAppToken({
        userId: luna.user.id,
        title: 'Articles client',
        scopes: ['manage-articles'],
      });
      const headers = { Authorization: `Bearer ${appToken.tokenString()}` as const };
      const deletion = await performJSONRequest<{ undo: [{ token: string }] }>(
        'DELETE',
        `/v4/articles/${article.uid}`,
        undefined,
        headers,
      );
      const [{ token }] = deletion.undo;

      const response = await performJSONRequest(
        'POST',
        `/v4/undo/${UNDO_ARTICLE_DELETE}`,
        { token },
        headers,
      );

      expect(response, 'to satisfy', {
        __httpCode: 200,
        article: { id: article.uid },
      });
      expect(await dbAdapter.getArticleById(article.uid), 'to satisfy', { toDelete: false });
    });
  });
});
