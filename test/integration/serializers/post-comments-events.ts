/* eslint-disable no-await-in-loop */
/* eslint-env node, mocha */

import expect from 'unexpected';

import cleanDB from '../../dbCleaner';
import { User, dbAdapter, Post, Comment } from '../../../app/models';
import { UUID } from '../../../app/support/types';
import { serializeFeed } from '../../../app/serializers/v2/post';

describe(`'notifyOfAllComments' field in serialized posts`, () => {
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

  describe(`Regular posts`, () => {
    const postIds: UUID[] = [];

    beforeEach(async () => {
      postIds.length = 0;

      // Create posts, 2 of Luna and 2 of Mars
      for (const author of [luna, mars]) {
        for (let i = 0; i < 2; i++) {
          const post = new Post({
            body: `Post #${i + 1} from ${author.username}`,
            userId: author.id,
            timelineIds: [(await author.getPostsTimelineId()) as UUID],
          });
          await post.create();
          postIds.push(post.id);
        }
      }
    });

    it(`should return all 'notifyOfAllComments' of false for anonymous`, async () => {
      const serResult = await serializeFeed(postIds, null);
      expect(serResult.posts, 'to have items satisfying', { notifyOfAllComments: false });
    });

    it(`should return all 'notifyOfAllComments' of false for Luna`, async () => {
      const serResult = await serializeFeed(postIds, luna.id);
      expect(serResult.posts, 'to have items satisfying', { notifyOfAllComments: false });
    });

    describe(`Luna subscribes to own posts`, () => {
      beforeEach(async () => {
        await luna.update({ preferences: { notifyOfCommentsOnMyPosts: true } });
      });

      it(`should return all 'notifyOfAllComments' of false for anonymous`, async () => {
        const serResult = await serializeFeed(postIds, null);
        expect(serResult.posts, 'to have items satisfying', { notifyOfAllComments: false });
      });

      it(`should return all 'notifyOfAllComments' of false for mars`, async () => {
        const serResult = await serializeFeed(postIds, mars.id);
        expect(serResult.posts, 'to have items satisfying', { notifyOfAllComments: false });
      });

      it(`should return all 'notifyOfAllComments' of true for own posts for Luna`, async () => {
        const serResult = await serializeFeed(postIds, luna.id);
        expect(serResult.posts, 'to satisfy', [
          { notifyOfAllComments: true },
          { notifyOfAllComments: true },
          { notifyOfAllComments: false },
          { notifyOfAllComments: false },
        ]);
      });

      describe(`Luna turns off notifications on one of her post and turn them on on one of Mars post`, () => {
        beforeEach(async () => {
          await dbAdapter.setCommentEventsStatusForPost(postIds[0], luna.id, false);
          await dbAdapter.setCommentEventsStatusForPost(postIds[2], luna.id, true);
        });

        it(`should return all 'notifyOfAllComments' of false for mars`, async () => {
          const serResult = await serializeFeed(postIds, mars.id);
          expect(serResult.posts, 'to have items satisfying', { notifyOfAllComments: false });
        });

        it(`should return 'notifyOfAllComments' of false-true-true-false`, async () => {
          const serResult = await serializeFeed(postIds, luna.id);
          expect(serResult.posts, 'to satisfy', [
            { notifyOfAllComments: false },
            { notifyOfAllComments: true },
            { notifyOfAllComments: true },
            { notifyOfAllComments: false },
          ]);
        });
      });
    });

    describe(`Luna subscribes to commented posts`, () => {
      beforeEach(async () => {
        await luna.update({ preferences: { notifyOfCommentsOnCommentedPosts: true } });
      });

      it(`should return 'notifyOfAllComments' of all false`, async () => {
        const serResult = await serializeFeed(postIds, luna.id);
        expect(serResult.posts, 'to satisfy', [
          { notifyOfAllComments: false },
          { notifyOfAllComments: false },
          { notifyOfAllComments: false },
          { notifyOfAllComments: false },
        ]);
      });

      describe(`Luna comments the first post of Mars`, () => {
        beforeEach(async () => {
          const comment = new Comment({
            body: 'Comment body',
            userId: luna.id,
            postId: postIds[2],
          });
          await comment.create();
        });

        it(`should return 'notifyOfAllComments' of false-false-true-false`, async () => {
          const serResult = await serializeFeed(postIds, luna.id);
          expect(serResult.posts, 'to satisfy', [
            { notifyOfAllComments: false },
            { notifyOfAllComments: false },
            { notifyOfAllComments: true },
            { notifyOfAllComments: false },
          ]);
        });
      });
    });
  });

  describe(`Direct messages`, () => {
    let postId: UUID;
    beforeEach(async () => {
      const post = new Post({
        body: `Direct Luna->Mars`,
        userId: luna.id,
        timelineIds: [
          (await luna.getDirectsTimelineId()) as UUID,
          (await mars.getDirectsTimelineId()) as UUID,
        ],
      });
      await post.create();
      postId = post.id;
    });

    it(`should return 'notifyOfAllComments' of true for mars`, async () => {
      const serResult = await serializeFeed([postId], mars.id);
      expect(serResult.posts, 'to satisfy', [{ notifyOfAllComments: true }]);
    });

    it(`should return 'notifyOfAllComments' of true for luna`, async () => {
      const serResult = await serializeFeed([postId], luna.id);
      expect(serResult.posts, 'to satisfy', [{ notifyOfAllComments: true }]);
    });

    describe(`Luna turns off notifications on one this direct`, () => {
      beforeEach(async () => {
        await dbAdapter.setCommentEventsStatusForPost(postId, luna.id, false);
      });

      it(`should return 'notifyOfAllComments' of true for mars`, async () => {
        const serResult = await serializeFeed([postId], mars.id);
        expect(serResult.posts, 'to satisfy', [{ notifyOfAllComments: true }]);
      });

      it(`should return 'notifyOfAllComments' of false for luna`, async () => {
        const serResult = await serializeFeed([postId], luna.id);
        expect(serResult.posts, 'to satisfy', [{ notifyOfAllComments: false }]);
      });
    });
  });
});
