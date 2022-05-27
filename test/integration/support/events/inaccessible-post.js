/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import { dbAdapter, User } from '../../../../app/models';
import { EVENT_TYPES } from '../../../../app/support/EventTypes';
import cleanDB from '../../../dbCleaner';
import { createComment, createPost } from '../../helpers/posts-and-comments';

describe('EventService: action over inaccessible post', () => {
  describe(`'comment_moderated' notifications`, () => {
    beforeEach(() => cleanDB($pg_database));

    let /** @type {User} */ luna, /** @type {User} */ mars;
    let /** @type {Post} */ lunaPost;
    let /** @type {Comment} */ marsComment;

    beforeEach(async () => {
      luna = new User({ username: 'luna', password: 'pw' });
      mars = new User({ username: 'mars', password: 'pw' });

      await Promise.all([luna, mars].map((u) => u.create()));

      lunaPost = await createPost(luna, `${luna.username} post`);
      marsComment = await createComment(mars, lunaPost, `${mars.username} post`);
    });

    it(`should create notification for Mars when Luna deletes Mars'es comment`, async () => {
      await marsComment.destroy(luna);
      const events = await dbAdapter.getUserEvents(mars.intId, [EVENT_TYPES.COMMENT_MODERATED]);
      expect(events, 'to have length', 1);
    });

    describe('Luna becomes private', () => {
      beforeEach(async () => {
        await luna.update({ isPrivate: '1', isProtected: '1' });
        // re-read post
        lunaPost = await dbAdapter.getPostById(lunaPost.id);
      });

      it(`should not allow Mars to see post`, async () => {
        const ok = await lunaPost.isVisibleFor(mars);
        expect(ok, 'to be false');
      });

      it(`should not create notification for Mars when Luna deletes Mars'es comment`, async () => {
        await marsComment.destroy(luna);
        const events = await dbAdapter.getUserEvents(mars.intId, [EVENT_TYPES.COMMENT_MODERATED]);
        expect(events, 'to be empty');
      });
    });

    describe('Luna bans Mars', () => {
      beforeEach(async () => {
        await luna.ban(mars.username);
        // re-read post
        lunaPost = await dbAdapter.getPostById(lunaPost.id);
      });

      it(`should not allow Mars to see post`, async () => {
        const ok = await lunaPost.isVisibleFor(mars);
        expect(ok, 'to be false');
      });

      it(`should not create notification for Mars when Luna deletes Mars'es comment`, async () => {
        await marsComment.destroy(luna);
        const events = await dbAdapter.getUserEvents(mars.intId, [EVENT_TYPES.COMMENT_MODERATED]);
        expect(events, 'to be empty');
      });
    });
  });
});
