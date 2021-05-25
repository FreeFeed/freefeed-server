/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../../../dbCleaner';
import { User, Group } from '../../../../app/models';

describe('Post isPropagable fields', () => {
  beforeEach(() => cleanDB($pg_database));

  describe('There are users Luna and Mars and groups Selenites and Celestials', () => {
    let luna,
      mars,
      selenites,
      celestials,
      lunaTimeline,
      selenitesTimeline,
      celestialsTimeline,
      lunaDirects,
      marsDirects;
    beforeEach(async () => {
      luna = new User({ username: 'luna', password: 'pw' });
      mars = new User({ username: 'mars', password: 'pw' });
      selenites = new Group({ username: 'selenites' });
      celestials = new Group({ username: 'celestials' });
      await Promise.all([luna.create(), mars.create()]);
      await Promise.all([selenites.create(luna.id), celestials.create(luna.id)]);
      [lunaTimeline, selenitesTimeline, celestialsTimeline, lunaDirects, marsDirects] =
        await Promise.all([
          luna.getPostsTimeline(),
          selenites.getPostsTimeline(),
          celestials.getPostsTimeline(),
          luna.getDirectsTimeline(),
          mars.getDirectsTimeline(),
        ]);
    });

    it('should create propagable post in Luna feed', async () => {
      const post = await createPost(luna, { body: 'Post body', timelineIds: [lunaTimeline.id] });
      expect(post.isPropagable, 'to equal', '1');
    });

    it('should create not propagable post in Selenites group', async () => {
      const post = await createPost(luna, {
        body: 'Post body',
        timelineIds: [selenitesTimeline.id],
      });
      expect(post.isPropagable, 'to equal', '0');
    });

    it('should create not propagable post in Selenites and Celestials groups', async () => {
      const post = await createPost(luna, {
        body: 'Post body',
        timelineIds: [selenitesTimeline.id, celestialsTimeline.id],
      });
      expect(post.isPropagable, 'to equal', '0');
    });

    it('should create not propagable direct post between Luna and Mars', async () => {
      const post = await createPost(luna, {
        body: 'Post body',
        timelineIds: [lunaDirects.id, marsDirects.id],
      });
      expect(post.isPropagable, 'to equal', '0');
    });

    it('should create propagable "public direct" post between Luna and Mars', async () => {
      const post = await createPost(luna, {
        body: 'Post body',
        timelineIds: [lunaDirects.id, marsDirects.id, lunaTimeline.id],
      });
      expect(post.isPropagable, 'to equal', '1');
    });

    it('should create propagable post in Luna feed and Selenites and Celestial groups', async () => {
      const post = await createPost(luna, {
        body: 'Post body',
        timelineIds: [selenitesTimeline.id, celestialsTimeline.id, lunaTimeline.id],
      });
      expect(post.isPropagable, 'to equal', '1');
    });

    it('should create not propagable "public direct" post between Luna and Mars and Celestial group', async () => {
      const post = await createPost(luna, {
        body: 'Post body',
        timelineIds: [lunaDirects.id, marsDirects.id, celestialsTimeline.id],
      });
      expect(post.isPropagable, 'to equal', '0');
    });
  });
});

async function createPost(author, postData) {
  const post = await author.newPost(postData);
  await post.create();
  return post;
}
