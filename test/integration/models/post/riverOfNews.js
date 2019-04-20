/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected'

import cleanDB from '../../../dbCleaner'
import {
  dbAdapter,
  User,
  Group,
  HOMEFEED_MODE_FRIENDS_ONLY,
  HOMEFEED_MODE_FRIENDS_ALL_ACTIVITY,
  HOMEFEED_MODE_CLASSIC,
} from '../../../../app/models'


describe('Post getRiverOfNewsTimelines method', () => {
  describe('Luna subscribed to Mars and Selenites and not subscribed to Venus and Celestials', () => {
    let luna, mars, venus, selenites, celestials;
    before(async () => {
      await cleanDB($pg_database);
      luna = new User({ username: 'luna', password: 'pw' });
      mars = new User({ username: 'mars', password: 'pw' });
      venus = new User({ username: 'venus', password: 'pw' });
      selenites = new Group({ username: 'selenites' });
      celestials = new Group({ username: 'celestials' });
      await Promise.all([
        luna.create(),
        mars.create(),
        venus.create(),
      ]);
      await Promise.all([
        selenites.create(luna.id),
        celestials.create(venus.id),
      ]);

      // Luna subscribed to Mars and Selenites
      await luna.subscribeTo(mars);
      await luna.subscribeTo(selenites);
    });

    it('shold bring post from Mars to Luna RoN in any mode', async () => {
      const post = await createPost(mars);
      expect(
        await post.getRiverOfNewsTimelines(HOMEFEED_MODE_FRIENDS_ONLY),
        'to have an item satisfying', { userId: luna.id },
      );
      expect(
        await post.getRiverOfNewsTimelines(HOMEFEED_MODE_CLASSIC),
        'to have an item satisfying', { userId: luna.id },
      );
      expect(
        await post.getRiverOfNewsTimelines(HOMEFEED_MODE_FRIENDS_ALL_ACTIVITY),
        'to have an item satisfying', { userId: luna.id },
      );
    });

    it('shold bring post from Venus to Selenites to Luna RoN in any mode', async () => {
      const post = await createPost(venus, [selenites]);
      expect(
        await post.getRiverOfNewsTimelines(HOMEFEED_MODE_FRIENDS_ONLY),
        'to have an item satisfying', { userId: luna.id },
      );
      expect(
        await post.getRiverOfNewsTimelines(HOMEFEED_MODE_CLASSIC),
        'to have an item satisfying', { userId: luna.id },
      );
      expect(
        await post.getRiverOfNewsTimelines(HOMEFEED_MODE_FRIENDS_ALL_ACTIVITY),
        'to have an item satisfying', { userId: luna.id },
      );
    });

    it('shold bring post from Venus liked by Mars to Luna RoN in wide and normal mode', async () => {
      let post = await createPost(venus);
      await post.addLike(mars);
      post = await reloadPost(post);
      expect(
        await post.getRiverOfNewsTimelines(HOMEFEED_MODE_FRIENDS_ONLY),
        'not to have an item satisfying', { userId: luna.id },
      );
      expect(
        await post.getRiverOfNewsTimelines(HOMEFEED_MODE_CLASSIC),
        'to have an item satisfying', { userId: luna.id },
      );
      expect(
        await post.getRiverOfNewsTimelines(HOMEFEED_MODE_FRIENDS_ALL_ACTIVITY),
        'to have an item satisfying', { userId: luna.id },
      );
    });

    it('shold bring post from Venus to Celestials liked by Mars to Luna RoN in wide mode', async () => {
      let post = await createPost(venus, [celestials]);
      await post.addLike(mars);
      post = await reloadPost(post);
      expect(
        await post.getRiverOfNewsTimelines(HOMEFEED_MODE_FRIENDS_ONLY),
        'not to have an item satisfying', { userId: luna.id },
      );
      expect(
        await post.getRiverOfNewsTimelines(HOMEFEED_MODE_CLASSIC),
        'not to have an item satisfying', { userId: luna.id },
      );
      expect(
        await post.getRiverOfNewsTimelines(HOMEFEED_MODE_FRIENDS_ALL_ACTIVITY),
        'to have an item satisfying', { userId: luna.id },
      );
    });

    it('shold bring post from Mars to Celestials  to Luna RoN in wide mode', async () => {
      const post = await createPost(mars, [celestials]);
      expect(
        await post.getRiverOfNewsTimelines(HOMEFEED_MODE_FRIENDS_ONLY),
        'not to have an item satisfying', { userId: luna.id },
      );
      expect(
        await post.getRiverOfNewsTimelines(HOMEFEED_MODE_CLASSIC),
        'not to have an item satisfying', { userId: luna.id },
      );
      expect(
        await post.getRiverOfNewsTimelines(HOMEFEED_MODE_FRIENDS_ALL_ACTIVITY),
        'to have an item satisfying', { userId: luna.id },
      );
    });
  });
});

async function createPost(author, feedOwners = []) {
  if (feedOwners.length === 0) {
    feedOwners.push(author);
  }

  const timelines = await Promise.all(feedOwners.map((u) => u.getPostsTimeline()));
  const post = await author.newPost({ body: 'post', timelineIds: timelines.map((t) => t.id) });
  await post.create();
  return post;
}

async function reloadPost(post) {
  return await dbAdapter.getPostById(post.id);
}
