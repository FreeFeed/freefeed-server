import { beforeEach, describe, it } from 'mocha';
import unexpected from 'unexpected';

import { dbAdapter } from '../../../../app/models';
import cleanDB from '../../../dbCleaner';
import { createPost } from '../../helpers/posts-and-comments';
import { createUser } from '../../helpers/users';

const expect = unexpected.clone();

describe('Search articles', () => {
  beforeEach(() => cleanDB(dbAdapter.database));

  it('should return the linked post for article title and digest matches', async () => {
    const luna = await createUser('luna');
    const article = await dbAdapter.createArticle({
      author_id: luna.id,
      title: 'Quasar article',
      digest: 'Nebula digest',
      body: { blocks: [] },
    });
    await dbAdapter.createArticle({
      author_id: luna.id,
      title: 'Quasar draft',
      digest: 'Nebula draft',
      body: { blocks: [] },
    });
    const post = await createPost(luna, 'Announcement');
    await article.setPost(post.id);

    expect(await dbAdapter.search('quasar'), 'to equal', [post.id]);
    expect(await dbAdapter.search('nebula'), 'to equal', [post.id]);
    expect(await dbAdapter.search('in-body:quasar'), 'to be empty');
    expect(await dbAdapter.search('quasar in-body:announcement'), 'to equal', [post.id]);
    expect(await dbAdapter.search('in-comments:quasar'), 'to be empty');
  });

  it('should filter posts by linked articles', async () => {
    const luna = await createUser('luna');
    const article = await dbAdapter.createArticle({
      author_id: luna.id,
      title: 'Article',
      digest: '',
      body: { blocks: [] },
    });
    const articlePost = await createPost(luna, 'Article announcement');
    const regularPost = await createPost(luna, 'Regular post');
    await article.setPost(articlePost.id);

    expect(await dbAdapter.search('has:article'), 'to equal', [articlePost.id]);
    expect(await dbAdapter.search('-has:article'), 'to equal', [regularPost.id]);
  });

  it('should not search a deleting article', async () => {
    const luna = await createUser('luna');
    const article = await dbAdapter.createArticle({
      author_id: luna.id,
      title: 'Quasar article',
      digest: '',
      body: { blocks: [] },
    });
    const post = await createPost(luna, 'Announcement');
    await article.setPost(post.id);
    await article.deactivate();

    expect(await dbAdapter.search('quasar'), 'to be empty');
    expect(await dbAdapter.search('has:article'), 'to be empty');
  });
});
