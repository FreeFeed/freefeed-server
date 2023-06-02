/* eslint-disable no-await-in-loop */
/* eslint-env node, mocha */

import expect from 'unexpected';

import cleanDB from '../../../dbCleaner';
import { User, dbAdapter, Post, Group, Comment } from '../../../../app/models';
import { GONE_COOLDOWN } from '../../../../app/models/user';

const FAKE_UID = '00000000-00000000-00000000-00000000';

describe('getDynamicUserStats', () => {
  before(() => cleanDB(dbAdapter.database));

  /** @type {User} */
  let luna;
  /** @type {User} */
  let mars;
  /** @type {Group} */
  let secretGroup;
  before(async () => {
    luna = new User({ username: 'luna', password: 'pw' });
    await luna.create();
    mars = new User({ username: 'mars', password: 'pw' });
    await mars.create();
    secretGroup = new Group({
      username: 'secret-group',
      screenName: 'secret-group',
      isPrivate: '1',
      isProtected: '1',
    });
    await secretGroup.create(luna.id);
  });

  it('should return nullish stats for unexisting user', async () => {
    const stats = await dbAdapter.getDynamicUserStats(FAKE_UID, null);
    expect(stats, 'to equal', {
      subscribers: null,
      subscriptions: null,
      posts: null,
      comments: null,
      likes: null,
    });
  });

  it('should return zero stats for Luna', async () => {
    const stats = await dbAdapter.getDynamicUserStats(luna.id, null);
    expect(stats, 'to equal', {
      subscribers: 0,
      subscriptions: 0,
      posts: 0,
      comments: 0,
      likes: 0,
    });
  });

  describe('Luna becomes protected', () => {
    before(() => luna.update({ isProtected: '1', isPrivate: '0' }));
    after(() => luna.update({ isProtected: '0', isPrivate: '0' }));

    it('should not return subscribers/subscriptions for anonymous', async () => {
      const stats = await dbAdapter.getDynamicUserStats(luna.id, null);
      expect(stats, 'to equal', {
        subscribers: null,
        subscriptions: null,
        posts: 0,
        comments: 0,
        likes: 0,
      });
    });

    it('should return zero stats for Mars', async () => {
      const stats = await dbAdapter.getDynamicUserStats(luna.id, mars.id);
      expect(stats, 'to equal', {
        subscribers: 0,
        subscriptions: 0,
        posts: 0,
        comments: 0,
        likes: 0,
      });
    });

    it('should see Lunas group for Luna herself', async () => {
      const stats = await dbAdapter.getDynamicUserStats(luna.id, luna.id);
      expect(stats, 'to equal', {
        subscribers: 0,
        subscriptions: 1,
        posts: 0,
        comments: 0,
        likes: 0,
      });
    });
  });

  describe('Luna becomes private', () => {
    before(() => luna.update({ isProtected: '1', isPrivate: '1' }));
    after(() => luna.update({ isProtected: '0', isPrivate: '0' }));

    it('should not return subscribers/subscriptions for anonymous', async () => {
      const stats = await dbAdapter.getDynamicUserStats(luna.id, null);
      expect(stats, 'to equal', {
        subscribers: null,
        subscriptions: null,
        posts: 0,
        comments: 0,
        likes: 0,
      });
    });

    it('should not return subscribers/subscriptions for Mars', async () => {
      const stats = await dbAdapter.getDynamicUserStats(luna.id, mars.id);
      expect(stats, 'to equal', {
        subscribers: null,
        subscriptions: null,
        posts: 0,
        comments: 0,
        likes: 0,
      });
    });

    it('should see Lunas group for Luna herself', async () => {
      const stats = await dbAdapter.getDynamicUserStats(luna.id, luna.id);
      expect(stats, 'to equal', {
        subscribers: 0,
        subscriptions: 1,
        posts: 0,
        comments: 0,
        likes: 0,
      });
    });
  });

  describe('Luna going to be deleted', () => {
    before(() => luna.setGoneStatus(GONE_COOLDOWN));
    after(() => luna.setGoneStatus(null));

    it('should return nullish stats for inactive user', async () => {
      const stats = await dbAdapter.getDynamicUserStats(luna.id, null);
      expect(stats, 'to equal', {
        subscribers: null,
        subscriptions: null,
        posts: null,
        comments: null,
        likes: null,
      });
    });
  });

  describe('Luna creates some public and some private posts', () => {
    before(async () => {
      const publicFeedId = await luna.getPostsTimelineId();
      const privateFeedId = await secretGroup.getPostsTimelineId();

      for (let i = 0; i < 5; i++) {
        const post = new Post({ userId: luna.id, body: 'Post', timelineIds: [publicFeedId] });
        await post.create();
      }

      for (let i = 0; i < 5; i++) {
        const post = new Post({ userId: luna.id, body: 'Post', timelineIds: [privateFeedId] });
        await post.create();
      }
    });

    it('should see public posts as anonymous', async () => {
      const stats = await dbAdapter.getDynamicUserStats(luna.id, null);
      expect(stats, 'to equal', {
        subscribers: 0,
        subscriptions: 0,
        posts: 5,
        comments: 0,
        likes: 0,
      });
    });

    it('should see public posts as Mars', async () => {
      const stats = await dbAdapter.getDynamicUserStats(luna.id, mars.id);
      expect(stats, 'to equal', {
        subscribers: 0,
        subscriptions: 0,
        posts: 5,
        comments: 0,
        likes: 0,
      });
    });

    it('should see all posts and private group subscription as Luna', async () => {
      const stats = await dbAdapter.getDynamicUserStats(luna.id, luna.id);
      expect(stats, 'to equal', {
        subscribers: 0,
        subscriptions: 1,
        posts: 10,
        comments: 0,
        likes: 0,
      });
    });

    describe('Luna and Mars are mutually subscribed', () => {
      before(async () => {
        await luna.subscribeTo(mars);
        await mars.subscribeTo(luna);
      });

      it(`should see Luna's subscribers/subscriptions as anonymous`, async () => {
        const stats = await dbAdapter.getDynamicUserStats(luna.id, null);
        expect(stats, 'to equal', {
          subscribers: 1,
          subscriptions: 1,
          posts: 5,
          comments: 0,
          likes: 0,
        });
      });

      it(`should see Luna's subscribers/subscriptions as Mars`, async () => {
        const stats = await dbAdapter.getDynamicUserStats(luna.id, mars.id);
        expect(stats, 'to equal', {
          subscribers: 1,
          subscriptions: 1,
          posts: 5,
          comments: 0,
          likes: 0,
        });
      });

      it(`should see Luna's subscribers/subscriptions as Luna`, async () => {
        const stats = await dbAdapter.getDynamicUserStats(luna.id, luna.id);
        expect(stats, 'to equal', {
          subscribers: 1,
          subscriptions: 2,
          posts: 10,
          comments: 0,
          likes: 0,
        });
      });

      describe('Luna wrote 2 comments to every post', () => {
        before(async () => {
          const postIds = await dbAdapter.database.getCol('select uid from posts');

          for (const postId of postIds) {
            for (let i = 0; i < 2; i++) {
              const comment = new Comment({ postId, userId: luna.id, body: 'Comment body' });
              await comment.create();
            }
          }
        });

        it(`should see Luna's comments as anonymous`, async () => {
          const stats = await dbAdapter.getDynamicUserStats(luna.id, null);
          expect(stats, 'to equal', {
            subscribers: 1,
            subscriptions: 1,
            posts: 5,
            comments: 10,
            likes: 0,
          });
        });

        it(`should see Luna's comments as Mars`, async () => {
          const stats = await dbAdapter.getDynamicUserStats(luna.id, mars.id);
          expect(stats, 'to equal', {
            subscribers: 1,
            subscriptions: 1,
            posts: 5,
            comments: 10,
            likes: 0,
          });
        });

        it(`should see Luna's comments as Luna`, async () => {
          const stats = await dbAdapter.getDynamicUserStats(luna.id, luna.id);
          expect(stats, 'to equal', {
            subscribers: 1,
            subscriptions: 2,
            posts: 10,
            comments: 20,
            likes: 0,
          });
        });

        describe('Mars wrote posts, Luna comments and likes them', () => {
          before(async () => {
            const publicFeedId = await mars.getPostsTimelineId();

            for (let i = 0; i < 5; i++) {
              const post = new Post({ userId: mars.id, body: 'Post', timelineIds: [publicFeedId] });
              await post.create();
              await post.addLike(luna);
              const comment = new Comment({
                postId: post.id,
                userId: luna.id,
                body: 'Comment body',
              });
              await comment.create();
            }
          });

          it(`should see Luna's likes as anonymous`, async () => {
            const stats = await dbAdapter.getDynamicUserStats(luna.id, null);
            expect(stats, 'to equal', {
              subscribers: 1,
              subscriptions: 1,
              posts: 5,
              comments: 15,
              likes: 5,
            });
          });

          it(`should see Luna's likes as Mars`, async () => {
            const stats = await dbAdapter.getDynamicUserStats(luna.id, mars.id);
            expect(stats, 'to equal', {
              subscribers: 1,
              subscriptions: 1,
              posts: 5,
              comments: 15,
              likes: 5,
            });
          });

          it(`should see Luna's likes as Luna`, async () => {
            const stats = await dbAdapter.getDynamicUserStats(luna.id, luna.id);
            expect(stats, 'to equal', {
              subscribers: 1,
              subscriptions: 2,
              posts: 10,
              comments: 25,
              likes: 5,
            });
          });

          describe('Mars goes private and unsubscribe Luna', () => {
            before(async () => {
              await mars.update({ isPrivate: '1' });
              await luna.unsubscribeFrom(mars);
            });

            it(`should see Luna's likes as anonymous`, async () => {
              const stats = await dbAdapter.getDynamicUserStats(luna.id, null);
              expect(stats, 'to equal', {
                subscribers: 1,
                subscriptions: 0,
                posts: 5,
                comments: 10,
                likes: 0,
              });
            });

            it(`should see Luna's likes as Mars`, async () => {
              const stats = await dbAdapter.getDynamicUserStats(luna.id, mars.id);
              expect(stats, 'to equal', {
                subscribers: 1,
                subscriptions: 0,
                posts: 5,
                comments: 15,
                likes: 5,
              });
            });

            it(`should see Luna's likes as Luna`, async () => {
              const stats = await dbAdapter.getDynamicUserStats(luna.id, luna.id);
              expect(stats, 'to equal', {
                subscribers: 1,
                subscriptions: 1,
                posts: 10,
                comments: 20,
                likes: 0,
              });
            });
          });
        });
      });
    });
  });

  describe('Luna creates group', () => {
    let selenites;
    before(async () => {
      selenites = new Group({
        username: 'selenites',
        screenName: 'selenites',
      });
      await selenites.create(luna.id);
    });

    it('should return stats for public group', async () => {
      const stats = await dbAdapter.getDynamicUserStats(selenites.id, null);
      expect(stats, 'to equal', {
        subscribers: 1,
        subscriptions: null,
        posts: 0,
        comments: null,
        likes: null,
      });
    });

    describe('Luna creates group', () => {
      before(() => selenites.update({ isProtected: '1', isPrivate: '1' }));
      after(() => selenites.update({ isProtected: '0', isPrivate: '0' }));

      it('should return nullish subscribers for private group as anonymous', async () => {
        const stats = await dbAdapter.getDynamicUserStats(selenites.id, null);
        expect(stats, 'to equal', {
          subscribers: null,
          subscriptions: null,
          posts: 0,
          comments: null,
          likes: null,
        });
      });

      it('should return non-nullish subscribers for private group as Luna', async () => {
        const stats = await dbAdapter.getDynamicUserStats(selenites.id, luna.id);
        expect(stats, 'to equal', {
          subscribers: 1,
          subscriptions: null,
          posts: 0,
          comments: null,
          likes: null,
        });
      });
    });
  });
});
