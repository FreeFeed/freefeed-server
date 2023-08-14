/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

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
    const comment1 = await createComment(luna, lunaPost, 'Comment body 1');
    const comment2 = await createComment(luna, lunaPost, 'Comment body 2');
    expect(comment1.shortId, 'to match', /^[a-f0-9]{2}1$/);
    expect(comment2.shortId, 'to match', /^[a-f0-9]{2}2$/);
  });
});
