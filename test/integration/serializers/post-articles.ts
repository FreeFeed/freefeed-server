import { beforeEach, describe, it } from 'mocha';
import expect from 'unexpected';

import { dbAdapter } from '../../../app/models';
import type { ArticleDbRowContent } from '../../../app/models/article';
import { serializeFeed } from '../../../app/serializers/v2/post';
import cleanDB from '../../dbCleaner';
import { createPost } from '../helpers/posts-and-comments';
import { createUsers } from '../helpers/users';

const content = {
  title: 'Article title',
  digest: 'Article digest',
  body: { blocks: [{ id: 'text', type: 'text', content: 'Article body' }] },
} satisfies ArticleDbRowContent;

describe('Articles in serialized feeds', () => {
  beforeEach(() => cleanDB(dbAdapter.database));

  it('should match multiple article summaries to their posts', async () => {
    const [luna] = await createUsers(['luna']);
    const firstPost = await createPost(luna, 'First post');
    const secondPost = await createPost(luna, 'Second post');
    const plainPost = await createPost(luna, 'Plain post');
    const firstArticle = await dbAdapter.createArticle({ author_id: luna.id, ...content });
    const secondArticle = await dbAdapter.createArticle({
      author_id: luna.id,
      ...content,
      title: 'Second article',
    });
    await firstArticle.setPost(firstPost.id);
    await secondArticle.setPost(secondPost.id);

    const result = await serializeFeed([firstPost.id, secondPost.id, plainPost.id], luna.id);
    const postsById = new Map(result.posts.map((post) => [post.id, post]));
    const articlesById = new Map(result.articles.map((article) => [article.id, article]));

    expect(postsById.get(firstPost.id), 'to satisfy', { articleId: firstArticle.id });
    expect(postsById.get(secondPost.id), 'to satisfy', { articleId: secondArticle.id });
    expect(postsById.get(plainPost.id), 'to satisfy', { articleId: null });
    expect([...articlesById.keys()].sort(), 'to equal', [firstArticle.id, secondArticle.id].sort());
    expect(articlesById.get(firstArticle.id), 'to satisfy', {
      title: content.title,
      digest: content.digest,
    });
    expect(articlesById.get(secondArticle.id), 'to satisfy', {
      title: 'Second article',
      digest: content.digest,
    });
  });

  it('should omit a deleting article', async () => {
    const [luna] = await createUsers(['luna']);
    const publicPost = await createPost(luna, 'Public post');
    const deletingArticle = await dbAdapter.createArticle({ author_id: luna.id, ...content });
    await deletingArticle.setPost(publicPost.id);
    await deletingArticle.deactivate();

    const result = await serializeFeed([publicPost.id], luna.id);

    expect(result.posts, 'to satisfy', [{ id: publicPost.id, articleId: null }]);
    expect(result.articles, 'to be empty');
  });
});
