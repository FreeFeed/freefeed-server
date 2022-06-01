/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import { dbAdapter, User } from '../../../../app/models';
import { EVENT_TYPES } from '../../../../app/support/EventTypes';
import cleanDB from '../../../dbCleaner';
import { createComment, createPost } from '../../helpers/posts-and-comments';

/**
 * @typedef { import("../../../../app/models").Post } Post
 */

describe('Post backlink notifications', () => {
  beforeEach(() => cleanDB($pg_database));

  let /** @type {User} */ luna, /** @type {User} */ mars;
  let /** @type {Post} */ lunaPost, /** @type {Post} */ marsPost;
  let /** @type {Comment} */ lunaComment;
  beforeEach(async () => {
    luna = new User({ username: 'luna', password: 'pw' });
    mars = new User({ username: 'mars', password: 'pw' });

    await Promise.all([luna, mars].map((u) => u.create()));

    marsPost = await createPost(mars, `Some post`);
    lunaPost = await createPost(luna, `Post mentioned ${marsPost.id}`);
    lunaComment = await createComment(luna, lunaPost, `Post mentioned ${marsPost.id}`);
  });

  describe(`'backlink_in_post' notifications`, () => {
    it(`should have a 'backlink_in_post' notification for Mars`, async () => {
      const events = await dbAdapter.getUserEvents(mars.intId, [EVENT_TYPES.BACKLINK_IN_POST]);
      expect(events, 'to have length', 1);
    });

    it(`should not create additional notifications when Luna updates post with same backlink`, async () => {
      await lunaPost.update({ body: `Post still mentioned ${marsPost.id}` });
      const events = await dbAdapter.getUserEvents(mars.intId, [EVENT_TYPES.BACKLINK_IN_POST]);
      expect(events, 'to have length', 1);
    });

    it(`should not create additional notifications when Luna removes backlink from post`, async () => {
      await lunaPost.update({ body: `Post mentioned nothing` });
      const events = await dbAdapter.getUserEvents(mars.intId, [EVENT_TYPES.BACKLINK_IN_POST]);
      expect(events, 'to have length', 1);
    });

    it(`should create additional notifications when Luna removes and then adds backlink to post`, async () => {
      await lunaPost.update({ body: `Post mentioned nothing` });
      await lunaPost.update({ body: `Post mentioned ${marsPost.id} again` });
      const events = await dbAdapter.getUserEvents(mars.intId, [EVENT_TYPES.BACKLINK_IN_POST]);
      expect(events, 'to have length', 2);
    });
  });

  describe(`'backlink_in_comment' notifications`, () => {
    it(`should have a 'backlink_in_post' notification for Mars`, async () => {
      const events = await dbAdapter.getUserEvents(mars.intId, [EVENT_TYPES.BACKLINK_IN_COMMENT]);
      expect(events, 'to have length', 1);
    });

    it(`should not create additional notifications when Luna updates post with same backlink`, async () => {
      await lunaComment.update({ body: `Post still mentioned ${marsPost.id}` });
      const events = await dbAdapter.getUserEvents(mars.intId, [EVENT_TYPES.BACKLINK_IN_COMMENT]);
      expect(events, 'to have length', 1);
    });

    it(`should not create additional notifications when Luna removes backlink from post`, async () => {
      await lunaComment.update({ body: `Post mentioned nothing` });
      const events = await dbAdapter.getUserEvents(mars.intId, [EVENT_TYPES.BACKLINK_IN_COMMENT]);
      expect(events, 'to have length', 1);
    });

    it(`should create additional notifications when Luna removes and then adds backlink to post`, async () => {
      await lunaComment.update({ body: `Post mentioned nothing` });
      await lunaComment.update({ body: `Post mentioned ${marsPost.id} again` });
      const events = await dbAdapter.getUserEvents(mars.intId, [EVENT_TYPES.BACKLINK_IN_COMMENT]);
      expect(events, 'to have length', 2);
    });
  });
});
