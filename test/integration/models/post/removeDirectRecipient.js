/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import { dbAdapter, Post, User } from '../../../../app/models';
import cleanDB from '../../../dbCleaner';

describe('Post removeDirectRecipient method', () => {
  let /** @type {User} */
    luna,
    /** @type {User} */
    mars,
    /** @type {User} */
    venus,
    /** @type {Post} */
    post;

  beforeEach(() => cleanDB($pg_database));
  beforeEach(async () => {
    luna = new User({ username: 'Luna', password: 'password' });
    mars = new User({ username: 'Mars', password: 'password' });
    venus = new User({ username: 'Venus', password: 'password' });
    await Promise.all([luna.create(), mars.create(), venus.create()]);
  });

  describe('Luna writes direct post to Mars', () => {
    beforeEach(async () => {
      await Promise.all([mars.subscribeTo(luna), luna.subscribeTo(mars)]);
      const [lunaDirectFeed, marsDirectFeed] = await Promise.all([
        luna.getDirectsTimeline(),
        mars.getDirectsTimeline(),
      ]);
      post = new Post({
        body: 'Post body',
        userId: luna.id,
        timelineIds: [lunaDirectFeed.id, marsDirectFeed.id],
      });
      await post.create();
    });

    it('should allow Mars to leave post', async () => {
      const ok = await post.removeDirectRecipient(mars);
      expect(ok, 'to be true');

      const updatedPost = await dbAdapter.getPostById(post.id);
      expect(updatedPost.destinationFeedIds, 'to have length', 1);

      const visible = await updatedPost.isVisibleFor(mars);
      expect(visible, 'to be false');
    });

    it('should not allow Luna to leave post', async () => {
      const ok = await post.removeDirectRecipient(luna);
      expect(ok, 'to be false');

      const updatedPost = await dbAdapter.getPostById(post.id);
      expect(updatedPost.destinationFeedIds, 'to have length', 2);
    });

    it('should not allow Venus to leave post', async () => {
      const ok = await post.removeDirectRecipient(venus);
      expect(ok, 'to be false');

      const updatedPost = await dbAdapter.getPostById(post.id);
      expect(updatedPost.destinationFeedIds, 'to have length', 2);
    });
  });

  describe('Luna writes direct post to Mars and Venus', () => {
    beforeEach(async () => {
      await Promise.all([mars.subscribeTo(luna), luna.subscribeTo(mars)]);
      const [lunaDirectFeed, marsDirectFeed, venusDirectFeed] = await Promise.all([
        luna.getDirectsTimeline(),
        mars.getDirectsTimeline(),
        venus.getDirectsTimeline(),
      ]);
      post = new Post({
        body: 'Post body',
        userId: luna.id,
        timelineIds: [lunaDirectFeed.id, marsDirectFeed.id, venusDirectFeed.id],
      });
      await post.create();
    });

    it('should allow Mars and Venus to simultaneously leave post', async () => {
      const [ok1, ok2] = await Promise.all([
        post.removeDirectRecipient(mars),
        post.removeDirectRecipient(venus),
      ]);
      expect(ok1, 'to be true');
      expect(ok2, 'to be true');

      const updatedPost = await dbAdapter.getPostById(post.id);
      expect(updatedPost.destinationFeedIds, 'to have length', 1);

      expect(await updatedPost.isVisibleFor(mars), 'to be false');
      expect(await updatedPost.isVisibleFor(venus), 'to be false');
    });
  });
});
