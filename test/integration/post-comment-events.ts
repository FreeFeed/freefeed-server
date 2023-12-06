/* eslint-env node, mocha */

import expect from 'unexpected';

import { Post, User, dbAdapter } from '../../app/models';
import cleanDB from '../dbCleaner';
import { EVENT_TYPES as ET } from '../../app/support/EventTypes';

import { createComment, createPost } from './helpers/posts-and-comments';

describe(`'post_comment' event emitting`, () => {
  let luna: User, mars: User;

  beforeEach(async () => {
    await cleanDB(dbAdapter.database);
    luna = new User({
      username: 'luna',
      screenName: 'Luna',
      password: 'pw',
    });
    mars = new User({
      username: 'mars',
      screenName: 'Mars',
      password: 'pw',
    });
    await Promise.all([luna, mars].map((u) => u.create()));
  });

  describe(`Luna will create post, Mars and Luna will comment on it`, () => {
    it(`should not create any notifications for Luna and Mars`, async () => {
      const post = await createPost(luna, 'Hello, world!');
      await createComment(luna, post, 'Comment from Luna');
      await createComment(mars, post, 'Comment from Mars');

      await expectUserEventsToBe(luna, []);
      await expectUserEventsToBe(mars, []);
    });

    describe('Luna want to receive notifications about comments on her posts', () => {
      beforeEach(() => luna.update({ preferences: { notifyOfCommentsOnMyPosts: true } }));

      it(`should create notifications for Luna, but not for Mars`, async () => {
        const post = await createPost(luna, 'Hello, world!');
        await createComment(luna, post, 'Comment from Luna');
        await createComment(mars, post, 'Comment from Mars');

        await expectUserEventsToBe(luna, [
          { event_type: ET.POST_COMMENT, created_by_user_id: mars.intId },
        ]);
        await expectUserEventsToBe(mars, []);
      });

      describe('Mars also want to receive notifications about comments on this post', () => {
        it(`should create notifications for Luna and for Mars`, async () => {
          const post = await createPost(luna, 'Hello, world!');
          await mars.notifyOfAllCommentsOfPost(post, true);

          await createComment(luna, post, 'Comment from Luna');
          await createComment(mars, post, 'Comment from Mars');

          await expectUserEventsToBe(luna, [
            { event_type: ET.POST_COMMENT, created_by_user_id: mars.intId },
          ]);
          await expectUserEventsToBe(mars, [
            { event_type: ET.POST_COMMENT, created_by_user_id: luna.intId },
            { event_type: ET.POST_COMMENTS_SUBSCRIBE, created_by_user_id: mars.intId },
          ]);
        });

        describe("Mars want and Luna doesn't want to receive notifications about comments on this post", () => {
          it(`should create notifications for Mars but not for Luna`, async () => {
            const post = await createPost(luna, 'Hello, world!');
            await mars.notifyOfAllCommentsOfPost(post, true);
            await luna.notifyOfAllCommentsOfPost(post, false);

            await createComment(luna, post, 'Comment from Luna');
            await createComment(mars, post, 'Comment from Mars');

            await expectUserEventsToBe(luna, [
              { event_type: ET.POST_COMMENTS_UNSUBSCRIBE, created_by_user_id: luna.intId },
            ]);
            await expectUserEventsToBe(mars, [
              { event_type: ET.POST_COMMENT, created_by_user_id: luna.intId },
              { event_type: ET.POST_COMMENTS_SUBSCRIBE, created_by_user_id: mars.intId },
            ]);
          });
        });
      });

      describe('Notifications about mentions', () => {
        it(`should create notifications for Luna and Mars`, async () => {
          const post = await createPost(luna, 'Hello, world!');
          await createComment(mars, post, 'Hi, @luna!');

          // Here should be only mention notification
          await expectUserEventsToBe(luna, [
            { event_type: ET.MENTION_IN_COMMENT, created_by_user_id: mars.intId },
          ]);
        });
      });
    });

    describe('Notifications about commented posts', () => {
      describe("Luna doesn't want to receive notifications about commented posts", () => {
        it(`should not create notification about comment of Mars after comment of Luna`, async () => {
          const post = await createPost(mars, 'Hello, world!');
          await createComment(luna, post, 'Comment from Luna');
          await createComment(mars, post, 'Comment from Mars');

          await expectUserEventsToBe(luna, []);
          await expectUserEventsToBe(mars, []);
        });
      });

      describe('Luna want to receive notifications about commented posts', () => {
        beforeEach(async () => {
          await luna.update({ preferences: { notifyOfCommentsOnCommentedPosts: true } });
        });

        it(`should not create notification when there are no comments of Luna`, async () => {
          const post = await createPost(mars, 'Hello, world!');
          await createComment(mars, post, 'Comment from Mars');

          await expectUserEventsToBe(luna, []);
          await expectUserEventsToBe(mars, []);
        });

        it(`should create notification about comment of Mars after comment of Luna`, async () => {
          const post = await createPost(mars, 'Hello, world!');
          await createComment(luna, post, 'Comment from Luna');
          await createComment(mars, post, 'Comment from Mars');

          await expectUserEventsToBe(luna, [
            { event_type: ET.POST_COMMENT, created_by_user_id: mars.intId },
          ]);
          await expectUserEventsToBe(mars, []);
        });
      });
    });

    describe('Direct message comments', () => {
      let post: Post;
      beforeEach(async () => {
        post = await createPost(luna, 'Hello, Mars!', [luna, mars]);
      });

      it(`should create 'direct_comment' notification for Luna`, async () => {
        await createComment(mars, post, 'Comment from Mars');
        await expectUserEventsToBe(luna, [
          { event_type: ET.DIRECT_COMMENT_CREATED, created_by_user_id: mars.intId },
        ]);
        await expectUserEventsToBe(mars, [
          { event_type: ET.DIRECT_CREATED, created_by_user_id: luna.intId },
        ]);
      });

      it(`should create 'mention_in_comment' (and only this) notification for Luna`, async () => {
        await createComment(mars, post, 'Hello, @luna!');
        await expectUserEventsToBe(luna, [
          { event_type: ET.MENTION_IN_COMMENT, created_by_user_id: mars.intId },
        ]);
        await expectUserEventsToBe(mars, [
          { event_type: ET.DIRECT_CREATED, created_by_user_id: luna.intId },
        ]);
      });

      describe(`Luna unsubscribes from this post notifications`, () => {
        beforeEach(() => luna.notifyOfAllCommentsOfPost(post, false));

        describe(`Comment from Mars`, () => {
          it(`should not create 'direct_comment' notification for Luna`, async () => {
            await createComment(mars, post, 'Comment from Mars');
            await expectUserEventsToBe(luna, [
              { event_type: ET.POST_COMMENTS_UNSUBSCRIBE, created_by_user_id: luna.intId },
            ]);
            await expectUserEventsToBe(mars, [
              { event_type: ET.DIRECT_CREATED, created_by_user_id: luna.intId },
            ]);
          });

          it(`should still create 'mention_in_comment' (and only this) notification for Luna`, async () => {
            await createComment(mars, post, 'Hello, @luna!');
            await expectUserEventsToBe(luna, [
              { event_type: ET.MENTION_IN_COMMENT, created_by_user_id: mars.intId },
              { event_type: ET.POST_COMMENTS_UNSUBSCRIBE, created_by_user_id: luna.intId },
            ]);
            await expectUserEventsToBe(mars, [
              { event_type: ET.DIRECT_CREATED, created_by_user_id: luna.intId },
            ]);
          });
        });

        describe(`Comment from Luna`, () => {
          it(`should create 'direct_comment' notification for Mars`, async () => {
            await createComment(luna, post, 'Comment from Luna');
            await expectUserEventsToBe(luna, [
              { event_type: ET.POST_COMMENTS_UNSUBSCRIBE, created_by_user_id: luna.intId },
            ]);
            await expectUserEventsToBe(mars, [
              { event_type: ET.DIRECT_COMMENT_CREATED, created_by_user_id: luna.intId },
              { event_type: ET.DIRECT_CREATED, created_by_user_id: luna.intId },
            ]);
          });

          it(`should still create 'mention_in_comment' (and only this) notification for Mars`, async () => {
            await createComment(luna, post, 'Hello, @mars!');
            await expectUserEventsToBe(luna, [
              { event_type: ET.POST_COMMENTS_UNSUBSCRIBE, created_by_user_id: luna.intId },
            ]);
            await expectUserEventsToBe(mars, [
              { event_type: ET.MENTION_IN_COMMENT, created_by_user_id: luna.intId },
              { event_type: ET.DIRECT_CREATED, created_by_user_id: luna.intId },
            ]);
          });
        });
      });
    });
  });
});

async function expectUserEventsToBe(
  user: User,
  expectedEvents: unknown[],
  requestedEventTypes?: string[],
) {
  const userEvents = await dbAdapter.getUserEvents(user.intId, requestedEventTypes);
  expect(userEvents, 'to be an', 'array');
  expect(userEvents, 'to have length', expectedEvents.length);

  for (const i in userEvents) {
    expect(userEvents[i], 'to satisfy', expectedEvents[i]);
  }
}
