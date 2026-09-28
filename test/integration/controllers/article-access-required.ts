import { beforeEach, describe, it } from 'mocha';
import expect from 'unexpected';

import { articleAccessRequired } from '../../../app/controllers/middlewares/article-access-required';
import { dbAdapter } from '../../../app/models';
import type { User } from '../../../app/models';
import type { Article } from '../../../app/models/article';
import { GONE_SUSPENDED } from '../../../app/models/user';
import cleanDB from '../../dbCleaner';
import { createPost } from '../helpers/posts-and-comments';
import { createUsers } from '../helpers/users';

type ArticleContext = Parameters<ReturnType<typeof articleAccessRequired>>[0];

describe('articleAccessRequired', () => {
  let luna: User;
  let mars: User;
  let article: Article;

  beforeEach(async () => {
    await cleanDB(dbAdapter.database);
    [luna, mars] = await createUsers(['luna', 'mars']);
    article = await dbAdapter.createArticle({
      author_id: luna.id,
      digest: '',
      body: '# Test article',
    });
  });

  const context = (articleId?: string, user?: User): ArticleContext =>
    ({ params: articleId ? { articleId } : {}, state: { user } }) as unknown as ArticleContext;

  const checkAccess = (ctx: ArticleContext, acceptShortId = false) =>
    articleAccessRequired(acceptShortId)(ctx, () => Promise.resolve());

  it('should reject a missing articleId parameter', async () => {
    await expect(checkAccess(context()), 'to be rejected with', { status: 500 });
  });

  it('should return 404 for an unknown article', async () => {
    await expect(
      checkAccess(context('00000000-0000-0000-0000-000000000000', luna)),
      'to be rejected with',
      { status: 404 },
    );
  });

  it('should return 404 for an unknown short ID', async () => {
    await expect(checkAccess(context('fffffffffff'), true), 'to be rejected with', {
      status: 404,
    });
  });

  it('should let the author access an unpublished article', async () => {
    const ctx = context(article.id, luna);
    let nextCalled = false;

    await articleAccessRequired()(ctx, () => {
      nextCalled = true;
      return Promise.resolve();
    });

    expect(nextCalled, 'to be', true);
    expect(ctx.state.article, 'to satisfy', { id: article.id });
  });

  it('should deny access to an unpublished article for others', async () => {
    await Promise.all(
      [undefined, mars].map(async (viewer) => {
        const ctx = context(article.id, viewer);
        await expect(checkAccess(ctx), 'to be rejected with', { status: 403 });
        expect(ctx.state.article, 'to be undefined');
      }),
    );
  });

  it('should resolve a valid short ID when enabled', async () => {
    const shortId = await article.getShortId();
    const ctx = context(shortId, luna);

    await checkAccess(ctx, true);

    expect(ctx.state.article, 'to satisfy', { id: article.id });
  });

  it('should allow anonymous and another user to access an article with a public post', async () => {
    const post = await createPost(luna, 'Public post');
    await article.setPost(post.id);

    await Promise.all(
      [undefined, mars].map(async (viewer) => {
        const ctx = context(article.id, viewer);
        await checkAccess(ctx);
        expect(ctx.state.article, 'to satisfy', { id: article.id, postId: post.id });
      }),
    );
  });

  it('should require sign-in for an article with a protected post', async () => {
    const post = await createPost(luna, 'Protected post');
    await article.setPost(post.id);
    await luna.update({ isProtected: '1' });

    await expect(checkAccess(context(article.id)), 'to be rejected with', {
      status: 403,
      message: 'Please sign in to view this article',
    });
    await expect(checkAccess(context(article.id, mars)), 'to be fulfilled');
  });

  it('should allow a subscriber but not a stranger to access a private article post', async () => {
    const post = await createPost(luna, 'Private post');
    await article.setPost(post.id);
    await luna.update({ isPrivate: '1' });

    await expect(checkAccess(context(article.id, mars)), 'to be rejected with', { status: 403 });
    await mars.subscribeTo(luna);
    await expect(checkAccess(context(article.id, mars)), 'to be fulfilled');
  });

  it('should deny a banned viewer access to an article with a public post', async () => {
    const post = await createPost(luna, 'Public post');
    await article.setPost(post.id);
    await luna.ban(mars.username);

    await expect(checkAccess(context(article.id, mars)), 'to be rejected with', { status: 403 });
  });

  it('should hide a deactivated article even from its author', async () => {
    await article.deactivate();

    await expect(checkAccess(context(article.id, luna)), 'to be rejected with', { status: 404 });
  });

  it('should hide an article while its author is inactive', async () => {
    await luna.setGoneStatus(GONE_SUSPENDED);

    await expect(checkAccess(context(article.id, luna)), 'to be rejected with', { status: 404 });
  });
});
