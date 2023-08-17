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
    const comment = await createComment(luna, lunaPost, 'Comment body');
    expect(comment.shortId, 'to match', /^[a-f0-9]{4,6}$/);
  });
});
