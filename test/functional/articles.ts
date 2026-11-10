import { beforeEach, describe, it } from 'mocha';
import expect from 'unexpected';

import { dbAdapter } from '../../app/models';
import type { Article, ArticleEditableContent } from '../../app/models/article';
import type { UUID } from '../../app/support/types';
import { UNDO_ARTICLE_DELETE, UndoArticleDelete } from '../../app/support/undo/article-delete';
import cleanDB from '../dbCleaner';

import {
  authHeaders,
  createMockAttachmentAsync,
  createTestUser,
  performJSONRequest,
} from './functional_test_helper';
import type { UserCtx } from './functional_test_helper';

const content = {
  digest: 'Test digest',
  body: '# Test article\n\nHello **world**.',
} satisfies ArticleEditableContent;

describe('Articles API: mutations', () => {
  let luna: UserCtx;

  beforeEach(async () => {
    await cleanDB(dbAdapter.database);
    luna = await createTestUser('luna');
  });

  it('should create and serialize an article preserving Markdown', async () => {
    const articleContent = { ...content, tags: ['First', 'Second', 'FIRST'] };
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
        title: 'Test article',
        digest: articleContent.digest,
        body: articleContent.body,
        createdAt: expect.it('to be a string'),
        updatedAt: expect.it('to be a string'),
        tags: ['first', 'second'],
      },
      attachments: [],
      users: [{ id: luna.user.id }],
    });

    const { id } = response.article;
    expect(await dbAdapter.getArticleById(id), 'to satisfy', {
      authorId: luna.user.id,
      title: 'Test article',
      version: 1,
      body: articleContent.body,
    });
    expect(await (await dbAdapter.getArticleById(id))?.getTags(), 'to equal', ['first', 'second']);
  });

  it('should derive a title from the beginning of Markdown without an h1', async () => {
    const body = 'Plain **Markdown** body';
    const response = await performJSONRequest(
      'POST',
      '/v4/articles',
      { digest: '', body, tags: [] },
      authHeaders(luna),
    );

    expect(response, 'to satisfy', {
      __httpCode: 200,
      article: { title: body, body },
    });
  });

  it('should not associate attachments referenced in Markdown', async () => {
    const attachment = await createMockAttachmentAsync(luna);
    const body = `# Article\n\n![image](attachment:${attachment.id})`;
    const response = await performJSONRequest(
      'POST',
      '/v4/articles',
      { digest: '', body, tags: [] },
      authHeaders(luna),
    );

    expect(response, 'to satisfy', {
      __httpCode: 200,
      article: { title: 'Article', body },
      attachments: [],
    });
    expect(await dbAdapter.getAttachmentById(attachment.id), 'not to have key', 'articleId');
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

  it('should reject a non-string body', async () => {
    const response = await performJSONRequest(
      'POST',
      '/v4/articles',
      { ...content, tags: [], body: { blocks: [] } },
      authHeaders(luna),
    );

    expect(response, 'to satisfy', { __httpCode: 422, err: /body/ });
    expect(await dbAdapter.database('articles'), 'to be empty');
  });

  describe('Update', () => {
    let article: Article;

    beforeEach(async () => {
      article = await dbAdapter.createArticle({ author_id: luna.user.id, ...content });
    });

    it('should update Markdown, derived title, digest, and tags', async () => {
      const updated = {
        digest: 'Updated digest',
        body: '# Updated *article*\n\nUpdated body.',
        tags: ['First', 'Second'],
      };
      const response = await performJSONRequest(
        'PUT',
        `/v4/articles/${article.id}?expectedVersion=1`,
        updated,
        authHeaders(luna),
      );

      expect(response, 'to satisfy', {
        __httpCode: 200,
        article: {
          id: article.id,
          version: 2,
          title: 'Updated article',
          digest: updated.digest,
          body: updated.body,
          tags: ['first', 'second'],
        },
      });
      expect(await article.getRevisions(10, 0), 'to satisfy', [
        { version: 1, title: 'Test article', body: content.body },
      ]);
    });

    it('should increment the version without a revision when only digest changes', async () => {
      const response = await performJSONRequest(
        'PUT',
        `/v4/articles/${article.id}?expectedVersion=1`,
        { ...content, digest: 'Updated digest', tags: [] },
        authHeaders(luna),
      );

      expect(response, 'to satisfy', {
        __httpCode: 200,
        article: { id: article.id, version: 2, digest: 'Updated digest' },
      });
      expect(await article.getRevisions(10, 0), 'to be empty');
    });

    it('should update only tags without changing the version', async () => {
      const response = await performJSONRequest(
        'PUT',
        `/v4/articles/${article.id}?expectedVersion=1`,
        { ...content, tags: ['New'] },
        authHeaders(luna),
      );

      expect(response, 'to satisfy', {
        __httpCode: 200,
        article: { id: article.id, version: 1, tags: ['new'] },
      });
      expect(await article.getRevisions(10, 0), 'to be empty');
    });

    it('should reject a stale version without changing the article', async () => {
      const first = { ...content, body: '# First update', tags: ['First'] };
      const second = { ...content, body: '# Second update', tags: ['Second'] };
      const firstResponse = await performJSONRequest(
        'PUT',
        `/v4/articles/${article.id}?expectedVersion=1`,
        first,
        authHeaders(luna),
      );
      expect(firstResponse, 'to satisfy', { __httpCode: 200, article: { version: 2 } });

      const response = await performJSONRequest(
        'PUT',
        `/v4/articles/${article.id}?expectedVersion=1`,
        second,
        authHeaders(luna),
      );

      expect(response, 'to satisfy', {
        __httpCode: 409,
        err: 'Article version is mismatched',
      });
      expect(await dbAdapter.getArticleById(article.id), 'to satisfy', {
        title: 'First update',
        version: 2,
      });
      expect(await article.getTags(), 'to equal', ['first']);
      expect(await article.getRevisions(10, 0), 'to have length', 1);
    });

    it('should require the expected version', async () => {
      const response = await performJSONRequest(
        'PUT',
        `/v4/articles/${article.id}`,
        { ...content, body: '# Updated without a version', tags: [] },
        authHeaders(luna),
      );

      expect(response, 'to satisfy', { __httpCode: 400, err: 'Invalid expected version' });
      expect(await dbAdapter.getArticleById(article.id), 'to satisfy', {
        title: 'Test article',
        version: 1,
      });
    });

    it('should deny updates by another user', async () => {
      const mars = await createTestUser('mars');
      const response = await performJSONRequest(
        'PUT',
        `/v4/articles/${article.id}?expectedVersion=1`,
        { ...content, body: '# Unauthorized update', tags: [] },
        authHeaders(mars),
      );

      expect(response, 'to satisfy', { __httpCode: 403 });
      expect(await dbAdapter.getArticleById(article.id), 'to satisfy', {
        title: 'Test article',
        version: 1,
      });
    });

    it('should reject a non-string body without changing the article', async () => {
      const response = await performJSONRequest(
        'PUT',
        `/v4/articles/${article.id}?expectedVersion=1`,
        { ...content, tags: [], body: { blocks: [] } },
        authHeaders(luna),
      );

      expect(response, 'to satisfy', { __httpCode: 422, err: /body/ });
      expect(await dbAdapter.getArticleById(article.id), 'to satisfy', {
        title: 'Test article',
        ...content,
        version: 1,
      });
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
        `/v4/articles/${article.id}`,
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
      expect(await dbAdapter.getArticleById(article.id), 'to satisfy', {
        toDelete: true,
        version: 1,
      });
    });

    it('should restore an article using its undo token', async () => {
      const deletion = await performJSONRequest<{ undo: [{ token: string }] }>(
        'DELETE',
        `/v4/articles/${article.id}`,
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
        article: { id: article.id, version: 1, title: 'Test article', ...content },
      });
      expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { toDelete: false });
    });

    it('should reject deletion by another user', async () => {
      const mars = await createTestUser('mars');
      const response = await performJSONRequest(
        'DELETE',
        `/v4/articles/${article.id}`,
        undefined,
        authHeaders(mars),
      );

      expect(response, 'to satisfy', { __httpCode: 403 });
      expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { toDelete: false });
    });

    it('should return 404 on repeated deletion', async () => {
      await performJSONRequest(
        'DELETE',
        `/v4/articles/${article.id}`,
        undefined,
        authHeaders(luna),
      );
      const response = await performJSONRequest(
        'DELETE',
        `/v4/articles/${article.id}`,
        undefined,
        authHeaders(luna),
      );

      expect(response, 'to satisfy', { __httpCode: 404, err: 'Article not found' });
    });

    it('should not let another user restore the article', async () => {
      const mars = await createTestUser('mars');
      const deletion = await performJSONRequest<{ undo: [{ token: string }] }>(
        'DELETE',
        `/v4/articles/${article.id}`,
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
      expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { toDelete: true });
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
        `/v4/articles/${article.id}`,
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

      expect(response, 'to satisfy', { __httpCode: 200, article: { id: article.id } });
      expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { toDelete: false });
    });
  });
});
