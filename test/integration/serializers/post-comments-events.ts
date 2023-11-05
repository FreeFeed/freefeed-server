/* eslint-disable no-await-in-loop */
/* eslint-env node, mocha */

import expect from 'unexpected';

import cleanDB from '../../dbCleaner';
import { User, dbAdapter, Post } from '../../../app/models';
import { UUID } from '../../../app/support/types';
import { serializeFeed } from '../../../app/serializers/v2/post';

describe(`'notifyOfAllComments' field in serialized posts`, () => {
  let luna: User, mars: User;
  const postIds: UUID[] = [];

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
    await mars.update({ acceptDirectsFrom: 'all' });

    postIds.length = 0;

    // Create posts, 2 of Luna and 2 of Mars
    for (const author of [luna, mars]) {
      for (let i = 0; i < 2; i++) {
        const post = new Post({
          body: `Post #${i + 1} from ${author.username}`,
          userId: author.id,
          timelineIds: [(await author.getPostsTimelineId()) as UUID],
          commentsDisabled: '0',
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
});
