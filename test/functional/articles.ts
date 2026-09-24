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
  performJSONRequest,
} from './functional_test_helper';
import type { UserCtx } from './functional_test_helper';

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
      body: {
        blocks: [
          ...content.body.blocks,
          { id: 'media', type: 'media', attachmentId: attachment.id },
        ],
      },
    };

    const response = await performJSONRequest(
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
        ...articleContent,
        createdAt: expect.it('to be a string'),
        updatedAt: expect.it('to be a string'),
        tags: [],
        attachmentIds: [attachment.id],
      },
      attachments: [{ id: attachment.id, createdBy: luna.user.id, postId: null }],
      users: [{ id: luna.user.id }],
    });

    const { id } = (response as typeof response & { article: { id: UUID } }).article;
    expect(await dbAdapter.getArticleById(id), 'to satisfy', {
      authorId: luna.user.id,
      version: 1,
      body: articleContent.body,
    });
    expect(await dbAdapter.getAttachmentById(attachment.id), 'to satisfy', { articleId: id });
  });

  it('should reject anonymous creation', async () => {
    const response = await performJSONRequest('POST', '/v4/articles', content);

    expect(response, 'to satisfy', { __httpCode: 401 });
    expect(await dbAdapter.database('articles'), 'to be empty');
  });

  it('should reject an invalid body', async () => {
    const response = await performJSONRequest(
      'POST',
      '/v4/articles',
      { ...content, body: { blocks: [{ id: 'bad', type: 'media', attachmentId: 'invalid' }] } },
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
});
