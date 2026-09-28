import { beforeEach, describe, it } from 'mocha';
import expect from 'unexpected';

import { dbAdapter } from '../../../app/models';
import type { ArticleEditableContent } from '../../../app/models/article';
import type { UUID } from '../../../app/support/types';
import cleanDB from '../../dbCleaner';
import {
  authHeaders,
  createTestUser,
  justCreatePost,
  performJSONRequest,
} from '../functional_test_helper';

const content = {
  digest: 'Test digest',
  body: '# Test article\n\nHello',
} satisfies ArticleEditableContent;

describe('Post article association', () => {
  beforeEach(() => cleanDB(dbAdapter.database));

  describe('Create', () => {
    it('should create a post associated with an article', async () => {
      const luna = await createTestUser('luna');
      const article = await dbAdapter.createArticle({
        author_id: luna.user.id,
        ...content,
      });
      await article.setTags(['first', 'second']);

      const response = await performJSONRequest<{
        posts: { id: UUID };
        articles: unknown;
      }>(
        'POST',
        '/v4/posts',
        {
          post: { body: 'Post body', articleId: article.id },
          meta: { feeds: [luna.username] },
        },
        authHeaders(luna),
      );

      const postId = response.posts.id;

      expect(response, 'to satisfy', {
        __httpCode: 200,
        posts: { articleId: article.id },
      });
      expect(response.articles, 'to exhaustively satisfy', [
        {
          id: article.id,
          authorId: luna.user.id,
          postId,
          shortId: await article.getShortId(),
          version: 1,
          title: 'Test article',
          digest: content.digest,
          createdAt: article.createdAt.toISOString(),
          updatedAt: article.updatedAt.toISOString(),
          tags: ['first', 'second'],
        },
      ]);
      expect(await dbAdapter.getArticleById(article.id), 'to satisfy', {
        postId,
      });
    });

    it(`should reject another user's article without creating a post`, async () => {
      const luna = await createTestUser('luna');
      const mars = await createTestUser('mars');
      const article = await dbAdapter.createArticle({ author_id: mars.user.id, ...content });

      const response = await performJSONRequest(
        'POST',
        '/v4/posts',
        {
          post: { body: 'Post body', articleId: article.id },
          meta: { feeds: [luna.username] },
        },
        authHeaders(luna),
      );

      expect(response, 'to satisfy', { __httpCode: 422, err: 'Article is unavailable' });
      expect(await dbAdapter.getUserPostsCount(luna.user.id), 'to be', 0);
    });

    it('should reject an article associated with another post without creating a post', async () => {
      const luna = await createTestUser('luna');
      const existingPost = await justCreatePost(luna, 'Existing post');
      const article = await dbAdapter.createArticle({ author_id: luna.user.id, ...content });
      await article.setPost(existingPost.id);

      const response = await performJSONRequest(
        'POST',
        '/v4/posts',
        {
          post: { body: 'Post body', articleId: article.id },
          meta: { feeds: [luna.username] },
        },
        authHeaders(luna),
      );

      expect(response, 'to satisfy', {
        __httpCode: 409,
        err: 'Article is already linked to another post',
      });
      expect(await dbAdapter.getUserPostsCount(luna.user.id), 'to be', 1);
      expect(await dbAdapter.getArticleById(article.id), 'to satisfy', {
        postId: existingPost.id,
      });
    });

    it('should reassign an article from a deleting post', async () => {
      const luna = await createTestUser('luna');
      const deletingPost = await justCreatePost(luna, 'Deleting post');
      const article = await dbAdapter.createArticle({ author_id: luna.user.id, ...content });
      await article.setPost(deletingPost.id);
      await deletingPost.inactivate();

      const response = await performJSONRequest<{ posts: { id: UUID } }>(
        'POST',
        '/v4/posts',
        {
          post: { body: 'New post', articleId: article.id },
          meta: { feeds: [luna.username] },
        },
        authHeaders(luna),
      );

      expect(response, 'to satisfy', { __httpCode: 200, posts: { articleId: article.id } });
      const postId = response.posts.id;
      expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { postId });
    });
  });

  it('should reject articleId when updating a post', async () => {
    const luna = await createTestUser('luna');
    const post = await justCreatePost(luna, 'Post body');
    const article = await dbAdapter.createArticle({ author_id: luna.user.id, ...content });

    const response = await performJSONRequest(
      'PUT',
      `/v4/posts/${post.id}`,
      { post: { articleId: article.id } },
      authHeaders(luna),
    );

    expect(response, 'to satisfy', {
      __httpCode: 422,
      err: 'Article can only be associated when creating a post',
    });
    expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { postId: null });
  });
});
