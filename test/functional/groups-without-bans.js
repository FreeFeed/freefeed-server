/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../dbCleaner';

import {
  authHeaders,
  banUser,
  createAndReturnPostToFeed,
  createCommentAsync,
  createGroupAsync,
  createTestUsers,
  performJSONRequest,
  unbanUser,
} from './functional_test_helper';

describe('Groups without bans', () => {
  let luna, mars, venus, jupiter;
  let selenites, celestials;

  before(() => cleanDB($pg_database));

  before(async () => {
    [luna, mars, venus, jupiter] = await createTestUsers(['luna', 'mars', 'venus', 'jupiter']);
    [selenites, celestials] = await Promise.all([
      createGroupAsync(luna, 'selenites'),
      createGroupAsync(mars, 'celestials'),
    ]);
  });

  describe('Enable/disable bans', () => {
    it(`should return 'disable_bans' in 'youCan' for Mars`, async () => {
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

    it(`should allow to re-enable disabled bans in Selenites`, async () => {
      const resp = await performJSONRequest(
        'POST',
        `/v2/groups/${selenites.username}/enableBans`,
        {},
        authHeaders(mars),
      );
      expect(resp.users.youCan, 'to contain', 'disable_bans');
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
      ]);
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

      describe('Comments', () => {
        it(`should see Venus comment in post to Selenites`, async () => {
          const resp = await shouldSeePost(postFromMarsToSelenites, jupiter);
          expect(resp.comments, 'to satisfy', [{ createdBy: venus.user.id }]);
        });

        it(`should see Venus comment in post to Selenites and Celestials`, async () => {
          const resp = await shouldSeePost(postFromMarsToSelenitesAndCelestials, jupiter);
          expect(resp.comments, 'to satisfy', [{ createdBy: venus.user.id }]);
        });

        it(`should not see Venus comment in post to Celestials`, async () => {
          const resp = await shouldSeePost(postFromMarsToCelestials, jupiter);
          expect(resp.comments, 'to satisfy', []);
        });

        it(`should find posts with 'in-comment:venus' only from Selenites group`, () =>
          shouldFindPosts(
            'in-comment:venus',
            [postFromMarsToSelenites, postFromMarsToSelenitesAndCelestials],
            jupiter,
          ));
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
          expect(resp.comments, 'to satisfy', [{ createdBy: venus.user.id }]);
        });

        it(`should see Venus comment in post to Selenites and Celestials`, async () => {
          const resp = await shouldSeePost(postFromMarsToSelenitesAndCelestials, luna);
          expect(resp.comments, 'to satisfy', [{ createdBy: venus.user.id }]);
        });

        it(`should also see Venus comment in post to Celestials because of bans asymmetry`, async () => {
          const resp = await shouldSeePost(postFromMarsToCelestials, luna);
          expect(resp.comments, 'to satisfy', [{ createdBy: venus.user.id }]);
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
