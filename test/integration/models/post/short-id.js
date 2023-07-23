/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../../../dbCleaner';
import { dbAdapter, User } from '../../../../app/models';

describe('Post Short ID', () => {
  let luna;

  beforeEach(async () => {
    await cleanDB($pg_database);
    luna = new User({ username: 'luna', password: 'pw' });
    await luna.create();
  });

  it('should create a post with a valid shortId', async () => {
    const post = await createPost(luna, { body: 'Post body' });
    const shortId = await post.getShortId();
    expect(shortId, 'to match', /^[a-f0-9]{6,10}$/);
  });

  it('should keep the shortId record with longId=null after the post removal', async () => {
    const post = await createPost(luna, { body: 'Post body' });
    const shortId = await post.getShortId();
    await post.destroy();
    const records = await dbAdapter.database.getAll(
      'select * from post_short_ids where short_id = ?',
      shortId,
    );
    expect(records.length, 'to equal', 1);
    expect(records[0].long_id, 'to equal', null);
  });
});

async function createPost(author, postData) {
  const post = await author.newPost(postData);
  await post.create();
  return post;
}
