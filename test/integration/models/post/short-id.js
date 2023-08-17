/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';
import config from 'config';

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
    const re = RegExp(`^[a-f0-9]{${config.shortLinks.initialLength.post},10}$`);
    const post = await createPost(luna, { body: 'Post body' });
    const shortId = await post.getShortId();
    expect(shortId, 'to match', re);
  });

  it('should eventually increase shortId length after the collision', async () => {
    const originalLength = config.shortLinks.initialLength.post;
    config.shortLinks.initialLength.post = 1; // To get a collision sooner

    const re1 = RegExp(`^[a-f0-9]$`);
    const re2 = RegExp(`^[a-f0-9]{2}$`);

    let post = await createPost(luna, { body: 'Post body' });
    let shortId = await post.getShortId();
    let longestShortId = shortId;
    expect(shortId, 'to match', re1); // First post must have shortId of initial length

    for (let i = 0; i < 16; i++) {
      post = await createPost(luna, { body: `Post body ${i}` }); // eslint-disable-line no-await-in-loop
      shortId = await post.getShortId(); // eslint-disable-line no-await-in-loop
      longestShortId = longestShortId.length > shortId.length ? longestShortId : shortId;
    }

    expect(longestShortId, 'to match', re2); // At least one post out of 17 must have shortId of initialLength + 1

    config.shortLinks.initialLength.post = originalLength;
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
