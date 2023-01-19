/* eslint-env node, mocha */
/* global $database, $pg_database */
import expect from 'unexpected';

import { getSingleton } from '../../app/app';
import { PubSub, dbAdapter } from '../../app/models';
import { EVENT_TYPES } from '../../app/support/EventTypes';
import { PubSubAdapter } from '../../app/support/PubSubAdapter';
import cleanDB from '../dbCleaner';

import {
  authHeaders,
  banUser,
  createAndReturnPostToFeed,
  createCommentAsync,
  createGroupAsync,
  createTestUsers,
  deletePostAsync,
  getUserEvents,
  like,
  likeComment,
  performJSONRequest,
  removeCommentAsync,
  unbanUser,
} from './functional_test_helper';
import Session from './realtime-session';

describe('Groups without bans', () => {
  let luna, mars, venus, jupiter;
  let selenites, celestials;

  before(() => cleanDB($pg_database));

  let appPort;

  before(async () => {
    const app = await getSingleton();
    appPort = app.context.config.port;
    const pubsubAdapter = new PubSubAdapter($database);
    PubSub.setPublisher(pubsubAdapter);
  });

  before(async () => {
    [luna, mars, venus, jupiter] = await createTestUsers(['luna', 'mars', 'venus', 'jupiter']);
    [selenites, celestials] = await Promise.all([
      createGroupAsync(luna, 'selenites'),
      createGroupAsync(mars, 'celestials'),
    ]);
  });

  describe('Enable/disable bans', () => {
    it(`should return 'disable_bans' in 'youCan' for Mars in Selenites`, async () => {
      const resp = await performJSONRequest(
        'GET',
        `/v1/users/${selenites.username}`,
        null,
        authHeaders(mars),
      );
      expect(resp.users.youCan, 'to contain', 'disable_bans');
    });

    it(`should allow to disable bans in Selenites`, async () => {
      const resp = await performJSONRequest(
        'POST',
        `/v2/groups/${selenites.username}/disableBans`,
        {},
        authHeaders(mars),
      );
      expect(resp.users.youCan, 'to contain', 'undisable_bans');
    });

    it(`should be an 'bans_in_group_disabled' event for Mars in Selenites`, async () => {
      const events = await getUserEvents(mars);
      expect(events.Notifications, 'to have an item satisfying', {
        event_type: EVENT_TYPES.BANS_IN_GROUP_DISABLED,
        group_id: selenites.group.id,
        created_user_id: mars.user.id,
      });
    });

    it(`should allow to re-enable disabled bans in Selenites`, async () => {
      const resp = await performJSONRequest(
        'POST',
        `/v2/groups/${selenites.username}/enableBans`,
        {},
        authHeaders(mars),
      );
      expect(resp.users.youCan, 'to contain', 'disable_bans');
    });

    it(`should be an 'bans_in_group_enabled' event for Mars in Selenites now`, async () => {
      const events = await getUserEvents(mars);
      expect(events.Notifications, 'to have an item satisfying', {
        event_type: EVENT_TYPES.BANS_IN_GROUP_ENABLED,
        group_id: selenites.group.id,
        created_user_id: mars.user.id,
      });
    });
  });

  describe('Venus create posts and comments to Selenites and Celestials groups', () => {
    let postFromVenusToSelenites;
    let postFromVenusToCelestials;
    let postFromVenusToSelenitesAndCelestials;
    let postFromMarsToSelenites;
    let postFromMarsToCelestials;
    let postFromMarsToSelenitesAndCelestials;
    before(async () => {
      [
        postFromVenusToSelenites,
        postFromVenusToCelestials,
        postFromVenusToSelenitesAndCelestials,
        postFromMarsToSelenites,
        postFromMarsToCelestials,
        postFromMarsToSelenitesAndCelestials,
      ] = await Promise.all([
        createAndReturnPostToFeed(selenites, venus, 'Post from Venus to Selenites'),
        createAndReturnPostToFeed(celestials, venus, 'Post from Venus to Celestials'),
        createAndReturnPostToFeed(
          [selenites, celestials],
          venus,
          'Post from Venus to Selenites and Celestials',
        ),
        createAndReturnPostToFeed(selenites, mars, 'Post from Mars to Selenites'),
        createAndReturnPostToFeed(celestials, mars, 'Post from Mars to Celestials'),
        createAndReturnPostToFeed(
          [selenites, celestials],
          mars,
          'Post from Mars to Selenites and Celestials',
        ),
      ]);

      await Promise.all([
        createCommentAsync(
          venus,
          postFromMarsToSelenites.id,
          'Comment from Venus to Mars in Selenites',
        ),
        createCommentAsync(
          venus,
          postFromMarsToCelestials.id,
          'Comment from Venus to Mars in Celestials',
        ),
        createCommentAsync(
          venus,
          postFromMarsToSelenitesAndCelestials.id,
          'Comment from Venus to Mars in Selenites and Celestials',
        ),
        like(postFromMarsToSelenites.id, venus.authToken),
        like(postFromMarsToCelestials.id, venus.authToken),
        like(postFromMarsToSelenitesAndCelestials.id, venus.authToken),
      ]);

      const marsCommentsResps = await Promise.all(
        [
          createCommentAsync(
            mars,
            postFromMarsToSelenites.id,
            'Comment from Mars to Mars in Selenites',
          ),
          createCommentAsync(
            mars,
            postFromMarsToCelestials.id,
            'Comment from Mars to Mars in Celestials',
          ),
          createCommentAsync(
            mars,
            postFromMarsToSelenitesAndCelestials.id,
            'Comment from Mars to Mars in Selenites and Celestials',
          ),
        ].map((p) => p.then((r) => r.json())),
      );

      // Venus likes Mars'es comments
      marsCommentsResps.map((r) => likeComment(r.comments.id, venus));
    });

    describe('Jupiter should see posts from banned Venus in Selenites group', () => {
      before(() => Promise.all([banUser(jupiter, venus), setBansDisabled(selenites, jupiter)]));
      after(() =>
        Promise.all([unbanUser(jupiter, venus), setBansDisabled(selenites, jupiter, false)]),
      );

      it(`should not see post to Celestials group only`, () =>
        shouldNotSeePost(postFromVenusToCelestials, jupiter));

      it(`should see post to Selenites group only`, () =>
        shouldSeePost(postFromVenusToSelenites, jupiter));

      it(`should see post to Selenites and Celestial groups`, () =>
        shouldSeePost(postFromVenusToSelenitesAndCelestials, jupiter));

      it(`should read all posts from Venus in Selenites groups`, () =>
        shouldReadFeed(
          selenites.username,
          [
            postFromVenusToSelenites,
            postFromVenusToSelenitesAndCelestials,
            postFromMarsToSelenites,
            postFromMarsToSelenitesAndCelestials,
          ],
          jupiter,
        ));

      it(`should read only one post from Venus in Celestials groups`, () =>
        shouldReadFeed(
          celestials.username,
          [
            postFromVenusToSelenitesAndCelestials,
            postFromMarsToCelestials,
            postFromMarsToSelenitesAndCelestials,
          ],
          jupiter,
        ));

      it(`should find posts 'from:venus' only from Selenites group`, () =>
        shouldFindPosts(
          'from:venus',
          [postFromVenusToSelenites, postFromVenusToSelenitesAndCelestials],
          jupiter,
        ));

      it(`should find posts with 'in-body:venus' only from Selenites group`, () =>
        shouldFindPosts(
          'in-body:venus',
          [postFromVenusToSelenites, postFromVenusToSelenitesAndCelestials],
          jupiter,
        ));

      describe('Comments and likes', () => {
        it(`should see Venus comment, like and clike in post to Selenites`, async () => {
          const resp = await shouldSeePost(postFromMarsToSelenites, jupiter);
          expect(resp.comments, 'to satisfy', [
            { createdBy: venus.user.id },
            { createdBy: mars.user.id, likes: 1 },
          ]);
          expect(resp.posts.likes, 'to satisfy', [venus.user.id]);
        });

        it(`should see Venus comment, like and clike in post to Selenites and Celestials`, async () => {
          const resp = await shouldSeePost(postFromMarsToSelenitesAndCelestials, jupiter);
          expect(resp.comments, 'to satisfy', [
            { createdBy: venus.user.id },
            { createdBy: mars.user.id, likes: 1 },
          ]);
          expect(resp.posts.likes, 'to satisfy', [venus.user.id]);
        });

        it(`should not see Venus comment, like and clike in post to Celestials`, async () => {
          const resp = await shouldSeePost(postFromMarsToCelestials, jupiter);
          expect(resp.comments, 'to satisfy', [{ createdBy: mars.user.id, likes: 0 }]);
          expect(resp.posts.likes, 'to satisfy', []);
        });

        it(`should find posts with 'in-comment:venus' only from Selenites group`, () =>
          shouldFindPosts(
            'in-comment:venus',
            [postFromMarsToSelenites, postFromMarsToSelenitesAndCelestials],
            jupiter,
          ));

        it(`should fetch single Venus comment in post to Selenites`, async () => {
          const resp = await shouldSeeComment(postFromMarsToSelenites, 1, jupiter);
          expect(resp.comments, 'to satisfy', { createdBy: venus.user.id, hideType: 0 });
        });

        it(`should fetch single Venus comment in post to Selenites and Celestials`, async () => {
          const resp = await shouldSeeComment(postFromMarsToSelenitesAndCelestials, 1, jupiter);
          expect(resp.comments, 'to satisfy', { createdBy: venus.user.id, hideType: 0 });
        });

        it(`should fetch single see Venus comment as hidden in post to Celestials`, async () => {
          const resp = await shouldSeeComment(postFromMarsToCelestials, 1, jupiter);
          expect(resp.comments, 'to satisfy', { createdBy: null, hideType: 2 });
        });
      });

      describe('Realtime', () => {
        let session, selenitesFeed, celestialsFeed;
        before(async () => {
          session = await Session.create(appPort, 'Jupiter session');
          await session.sendAsync('auth', { authToken: jupiter.authToken });

          [selenitesFeed, celestialsFeed] = await Promise.all([
            dbAdapter.getUserNamedFeed(selenites.group.id, 'Posts'),
            dbAdapter.getUserNamedFeed(celestials.group.id, 'Posts'),
          ]);

          await session.sendAsync('subscribe', { timeline: [selenitesFeed.id, celestialsFeed.id] });
        });
        after(() => session.disconnect());

        it(`should get 'post:new' when Venus writes a post to Selenites`, async () => {
          const test = session.receiveWhile('post:new', async () => {
            const post = await createAndReturnPostToFeed(selenites, venus, 'Hello');
            await deletePostAsync(venus, post.id);
          });
          await expect(test, 'to be fulfilled with', { posts: { createdBy: venus.user.id } });
        });

        it(`should get 'post:new' when Venus writes a post to Selenites and Celestials`, async () => {
          const test = session.receiveWhile('post:new', async () => {
            const post = await createAndReturnPostToFeed([selenites, celestials], venus, 'Hello');
            await deletePostAsync(venus, post.id);
          });
          await expect(test, 'to be fulfilled with', { posts: { createdBy: venus.user.id } });
        });

        it(`should not get 'post:new' when Venus writes a post to Selenites and Celestials`, async () => {
          const test = session.notReceiveWhile('post:new', async () => {
            const post = await createAndReturnPostToFeed([celestials], venus, 'Hello');
            await deletePostAsync(venus, post.id);
          });
          await expect(test, 'to be fulfilled');
        });

        it(`should get 'comment:new' when Venus writes a comment in Selenites`, async () => {
          const test = session.receiveWhile('comment:new', async () => {
            const resp = await createCommentAsync(venus, postFromMarsToSelenites.id, 'Hello').then(
              (r) => r.json(),
            );
            await removeCommentAsync(venus, resp.comments.id);
          });
          await expect(test, 'to be fulfilled with', { comments: { createdBy: venus.user.id } });
        });

        it(`should get 'comment:new' when Venus writes a comment in Selenites and Celestials`, async () => {
          const test = session.receiveWhile('comment:new', async () => {
            const resp = await createCommentAsync(
              venus,
              postFromMarsToSelenitesAndCelestials.id,
              'Hello',
            ).then((r) => r.json());
            await removeCommentAsync(venus, resp.comments.id);
          });
          await expect(test, 'to be fulfilled with', { comments: { createdBy: venus.user.id } });
        });

        it(`should not get 'comment:new' when Venus writes a comment in Celestials`, async () => {
          const test = session.notReceiveWhile('comment:new', async () => {
            const resp = await createCommentAsync(venus, postFromMarsToCelestials.id, 'Hello').then(
              (r) => r.json(),
            );
            await removeCommentAsync(venus, resp.comments.id);
          });
          await expect(test, 'to be fulfilled');
        });
      });
    });

    describe('Luna (as admin) should see posts in Selenites group from Venus who banned her', () => {
      before(() => Promise.all([banUser(venus, luna), setBansDisabled(selenites, luna)]));
      after(() => Promise.all([unbanUser(venus, luna), setBansDisabled(selenites, luna, false)]));

      it(`should not see post to Celestials group only`, () =>
        shouldNotSeePost(postFromVenusToCelestials, luna));

      it(`should see post to Selenites group only`, () =>
        shouldSeePost(postFromVenusToSelenites, luna));

      it(`should see post to Selenites and Celestial groups`, () =>
        shouldSeePost(postFromVenusToSelenitesAndCelestials, luna));

      it(`should read all posts from Venus in Selenites groups`, () =>
        shouldReadFeed(
          selenites.username,
          [
            postFromVenusToSelenites,
            postFromVenusToSelenitesAndCelestials,
            postFromMarsToSelenites,
            postFromMarsToSelenitesAndCelestials,
          ],
          luna,
        ));

      it(`should read only one post from Venus in Celestials groups`, () =>
        shouldReadFeed(
          celestials.username,
          [
            postFromVenusToSelenitesAndCelestials,
            postFromMarsToCelestials,
            postFromMarsToSelenitesAndCelestials,
          ],
          luna,
        ));

      it(`should find posts 'from:venus' only from Selenites group`, () =>
        shouldFindPosts(
          'from:venus',
          [postFromVenusToSelenites, postFromVenusToSelenitesAndCelestials],
          luna,
        ));

      it(`should find posts with 'in-body:venus' only from Selenites group`, () =>
        shouldFindPosts(
          'in-body:venus',
          [postFromVenusToSelenites, postFromVenusToSelenitesAndCelestials],
          luna,
        ));

      describe('Comments', () => {
        it(`should see Venus comment in post to Selenites`, async () => {
          const resp = await shouldSeePost(postFromMarsToSelenites, luna);
          expect(resp.comments, 'to satisfy', [
            { createdBy: venus.user.id },
            { createdBy: mars.user.id },
          ]);
        });

        it(`should see Venus comment in post to Selenites and Celestials`, async () => {
          const resp = await shouldSeePost(postFromMarsToSelenitesAndCelestials, luna);
          expect(resp.comments, 'to satisfy', [
            { createdBy: venus.user.id },
            { createdBy: mars.user.id },
          ]);
        });

        it(`should also see Venus comment in post to Celestials because of bans asymmetry`, async () => {
          const resp = await shouldSeePost(postFromMarsToCelestials, luna);
          expect(resp.comments, 'to satisfy', [
            { createdBy: venus.user.id },
            { createdBy: mars.user.id },
          ]);
        });

        it(`should find all posts with 'in-comment:venus' because of bans asymmetry`, () =>
          shouldFindPosts(
            'in-comment:venus',
            [
              postFromMarsToSelenites,
              postFromMarsToSelenitesAndCelestials,
              postFromMarsToCelestials,
            ],
            luna,
          ));
      });

      describe('Realtime', () => {
        let session, selenitesFeed, celestialsFeed;
        before(async () => {
          session = await Session.create(appPort, 'Luna session');
          await session.sendAsync('auth', { authToken: luna.authToken });

          [selenitesFeed, celestialsFeed] = await Promise.all([
            dbAdapter.getUserNamedFeed(selenites.group.id, 'Posts'),
            dbAdapter.getUserNamedFeed(celestials.group.id, 'Posts'),
          ]);

          await session.sendAsync('subscribe', { timeline: [selenitesFeed.id, celestialsFeed.id] });
        });
        after(() => session.disconnect());

        it(`should get 'post:new' when Venus writes a post to Selenites`, async () => {
          const test = session.receiveWhile('post:new', async () => {
            const post = await createAndReturnPostToFeed(selenites, venus, 'Hello');
            await deletePostAsync(venus, post.id);
          });
          await expect(test, 'to be fulfilled with', { posts: { createdBy: venus.user.id } });
        });

        it(`should get 'post:new' when Venus writes a post to Selenites and Celestials`, async () => {
          const test = session.receiveWhile('post:new', async () => {
            const post = await createAndReturnPostToFeed([selenites, celestials], venus, 'Hello');
            await deletePostAsync(venus, post.id);
          });
          await expect(test, 'to be fulfilled with', { posts: { createdBy: venus.user.id } });
        });

        it(`should not get 'post:new' when Venus writes a post to Selenites and Celestials`, async () => {
          const test = session.notReceiveWhile('post:new', async () => {
            const post = await createAndReturnPostToFeed([celestials], venus, 'Hello');
            await deletePostAsync(venus, post.id);
          });
          await expect(test, 'to be fulfilled');
        });
      });
    });
  });
});

// Helpers

async function shouldSeePost(post, viewer = null) {
  const resp = await performJSONRequest('GET', `/v2/posts/${post.id}`, null, authHeaders(viewer));
  expect(resp, 'to satisfy', { __httpCode: 200 });
  return resp;
}

async function shouldNotSeePost(post, viewer = null) {
  const resp = await performJSONRequest('GET', `/v2/posts/${post.id}`, null, authHeaders(viewer));
  expect(resp, 'to satisfy', { __httpCode: expect.it('to be within', 400, 499) });
}

async function shouldSeeComment(post, commentNum, viewer = null) {
  const resp = await performJSONRequest(
    'GET',
    `/v2/posts/${post.id}/comments/${commentNum}`,
    null,
    authHeaders(viewer),
  );
  expect(resp, 'to satisfy', { __httpCode: 200 });
  return resp;
}

async function shouldFindPosts(query, posts, viewer = null) {
  const resp = await performJSONRequest(
    'GET',
    `/v2/search?qs=${encodeURIComponent(query)}`,
    null,
    authHeaders(viewer),
  );
  expect(resp, 'to satisfy', { __httpCode: 200 });
  expect(
    resp.posts,
    'when sorted by',
    idCmp,
    'to satisfy',
    posts.map(({ id }) => ({ id })).sort(idCmp),
  );
}

async function shouldReadFeed(feedName, posts, viewer = null) {
  const resp = await performJSONRequest(
    'GET',
    `/v2/timelines/${feedName}`,
    null,
    authHeaders(viewer),
  );
  expect(resp, 'to satisfy', { __httpCode: 200 });
  expect(
    resp.posts,
    'when sorted by',
    idCmp,
    'to satisfy',
    posts.map(({ id }) => ({ id })).sort(idCmp),
  );
}

async function setBansDisabled(group, viewer, doSet = true) {
  const resp = await performJSONRequest(
    'POST',
    `/v2/groups/${group.username}/${doSet ? 'disableBans' : 'enableBans'}`,
    {},
    authHeaders(viewer),
  );
  expect(resp, 'to satisfy', { __httpCode: 200 });
}

function idCmp(a, b) {
  // eslint-disable-next-line no-nested-ternary
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
