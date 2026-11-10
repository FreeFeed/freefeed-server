import { beforeEach, describe, it } from 'mocha';
import unexpected from 'unexpected';

import { dbAdapter, User } from '../../../../app/models';
import type { Article, ArticleEditableContent } from '../../../../app/models/article';
import type { UUID } from '../../../../app/support/types';
import cleanDB from '../../../dbCleaner';
import { createPost } from '../../helpers/posts-and-comments';
import { createUser } from '../../helpers/users';

const expect = unexpected.clone();

describe('Article.setPost', () => {
  beforeEach(() => cleanDB(dbAdapter.database));

  const ARTICLE_CONTENT = {
    digest: 'test-digest',
    body: '# Test Article\n\nTest content',
  } satisfies ArticleEditableContent;

  let luna: User;
  let article: Article;
  beforeEach(async () => {
    luna = await createUser('luna');
    article = await dbAdapter.createArticle({ author_id: luna.id, ...ARTICLE_CONTENT });
  });

  it(`should associate the author's post`, async () => {
    const post = await createPost(luna, 'Post body');

    expect(await article.setPost(post.id), 'to equal', true);
    expect(article.postId, 'to equal', post.id);
    expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { postId: post.id });
  });

  it('should not replace an active associated post', async () => {
    const firstPost = await createPost(luna, 'First post');
    const secondPost = await createPost(luna, 'Second post');

    await article.setPost(firstPost.id);
    expect(await article.setPost(secondPost.id), 'to equal', false);
    expect(article.postId, 'to equal', firstPost.id);
    expect(await dbAdapter.getArticleById(article.id), 'to satisfy', {
      postId: firstPost.id,
    });
  });

  it('should replace a deleting associated post and remove the new association', async () => {
    const firstPost = await createPost(luna, 'First post');
    const secondPost = await createPost(luna, 'Second post');

    await article.setPost(firstPost.id);
    await firstPost.inactivate();
    expect(await article.setPost(secondPost.id), 'to equal', true);
    expect(article.postId, 'to equal', secondPost.id);
    expect(await dbAdapter.getArticleById(article.id), 'to satisfy', {
      postId: secondPost.id,
    });

    expect(await article.setPost(null), 'to equal', true);
    expect(article.postId, 'to be null');
    expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { postId: null });
  });

  it('should clear the association when the post is deleted', async () => {
    const post = await createPost(luna, 'Post body');
    await article.setPost(post.id);

    await post.destroy();

    expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { postId: null });
  });

  it('should not create a revision or change the article version', async () => {
    const post = await createPost(luna, 'Post body');

    await article.setPost(post.id);

    expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { version: 1 });
    expect(await article.getRevisions(10, 0), 'to be empty');
  });

  it('should not detach a deleting article', async () => {
    const post = await createPost(luna, 'Post body');
    await article.setPost(post.id);
    await article.deactivate();

    expect(await article.setPost(null), 'to equal', false);
    expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { postId: post.id });
  });

  it('should reject an unknown post without changing the association', async () => {
    const post = await createPost(luna, 'Post body');
    const unknownId = '00000000-0000-0000-0000-000000000000' as UUID;
    await article.setPost(post.id);

    expect(await article.setPost(unknownId), 'to equal', false);
    expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { postId: post.id });
  });

  it(`should reject another author's post without changing the association`, async () => {
    const ownPost = await createPost(luna, 'Own post');
    const mars = await createUser('mars');
    const anotherPost = await createPost(mars, 'Another post');
    await article.setPost(ownPost.id);

    expect(await article.setPost(anotherPost.id), 'to equal', false);
    expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { postId: ownPost.id });
  });

  it('should not associate one post with two articles', async () => {
    const post = await createPost(luna, 'Post body');
    const secondArticle = await dbAdapter.createArticle({
      author_id: luna.id,
      ...ARTICLE_CONTENT,
    });
    await article.setPost(post.id);

    await expect(secondArticle.setPost(post.id), 'to be rejected');
    expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { postId: post.id });
    expect(await dbAdapter.getArticleById(secondArticle.id), 'to satisfy', { postId: null });
  });
});
