/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';
import config from 'config';

import cleanDB from '../../../dbCleaner';
import { User } from '../../../../app/models';
import { createComment, createPost } from '../../helpers/posts-and-comments';

describe('Comment Short ID', () => {
  let luna, lunaPost;

  beforeEach(async () => {
    await cleanDB($pg_database);
    luna = new User({ username: 'luna', password: 'pw' });
    await luna.create();
    lunaPost = await createPost(luna, `Post body`);
  });

  it('should create a comment with a valid shortId', async () => {
    const re = RegExp(`^[a-f0-9]{${config.shortLinks.initialLength.comment},6}$`);
    const comment = await createComment(luna, lunaPost, 'Comment body');
    expect(comment.shortId, 'to match', re);
  });

  it('should eventually increase shortId length after the collision', async () => {
    const originalLength = config.shortLinks.initialLength.comment;
    config.shortLinks.initialLength.comment = 1; // To get a collision sooner

    const re1 = RegExp(`^[a-f0-9]$`);
    const re2 = RegExp(`^[a-f0-9]{2}$`);

    let comment = await createComment(luna, lunaPost, `Comment body`);
    let longestShortId = comment.shortId;
    expect(comment.shortId, 'to match', re1); // First comment must have shortId of initial length

    for (let i = 0; i < 16; i++) {
      comment = await createComment(luna, lunaPost, `Comment body ${i}`); // eslint-disable-line no-await-in-loop
      longestShortId =
        longestShortId.length > comment.shortId.length ? longestShortId : comment.shortId;
    }

    expect(longestShortId, 'to match', re2); // At least one comment out of 17 must have shortId of initialLength + 1

    config.shortLinks.initialLength.comment = originalLength;
  });
});
