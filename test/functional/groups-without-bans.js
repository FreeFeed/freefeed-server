/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../dbCleaner';

import {
  authHeaders,
  banUser,
  createAndReturnPostToFeed,
  createGroupAsync,
  createTestUsers,
  performJSONRequest,
} from './functional_test_helper';

describe('Groups without bans', () => {
  let luna, mars, venus, jupiter;
  let selenites, celestials;

  beforeEach(() => cleanDB($pg_database));

  beforeEach(async () => {
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
      let resp = await performJSONRequest(
        'POST',
        `/v2/groups/${selenites.username}/disableBans`,
        {},
        authHeaders(mars),
      );
      expect(resp.users.youCan, 'to contain', 'undisable_bans');

      resp = await performJSONRequest(
        'POST',
        `/v2/groups/${selenites.username}/enableBans`,
        {},
        authHeaders(mars),
      );
      expect(resp.users.youCan, 'to contain', 'disable_bans');
    });
  });

  describe('Venus wrote posts to Selenites and Celestials groups', () => {
    let postFormVenusToSelenites;
    let postFormVenusToCelestials;
    let postFormVenusToSelenitesAndCelestials;
    beforeEach(async () => {
      [postFormVenusToSelenites, postFormVenusToCelestials, postFormVenusToSelenitesAndCelestials] =
        await Promise.all([
          createAndReturnPostToFeed(selenites, venus, 'Post from Venus to Selenites'),
          createAndReturnPostToFeed(celestials, venus, 'Post from Venus to Celestials'),
          createAndReturnPostToFeed(
            [selenites, celestials],
            venus,
            'Post from Venus to Selenites and Celestials',
          ),
        ]);
    });

    describe('Jupiter should see posts from banned Venus in Selenites group', () => {
      beforeEach(() => Promise.all([banUser(jupiter, venus), setBansDisabled(selenites, jupiter)]));

      it(`should not see to Celestials group only`, () =>
        shouldNotSeePost(postFormVenusToCelestials, jupiter));

      it(`should see post to Selenites group only`, () =>
        shouldSeePost(postFormVenusToSelenites, jupiter));

      it(`should see post to Selenites and Celestial groups`, () =>
        shouldSeePost(postFormVenusToSelenitesAndCelestials, jupiter));

      it(`should read all posts from Venus in Selenites groups`, () =>
        shouldReadFeed(
          selenites.username,
          [postFormVenusToSelenites, postFormVenusToSelenitesAndCelestials],
          jupiter,
        ));

      it(`should read only one post from Venus in Celestials groups`, () =>
        shouldReadFeed(celestials.username, [postFormVenusToSelenitesAndCelestials], jupiter));

      it(`should find posts 'from:venus' only from Selenites group`, () =>
        shouldFindPosts(
          'from:venus',
          [postFormVenusToSelenites, postFormVenusToSelenitesAndCelestials],
          jupiter,
        ));

      it(`should find posts with 'in-body:venus' only from Selenites group`, () =>
        shouldFindPosts(
          'venus',
          [postFormVenusToSelenites, postFormVenusToSelenitesAndCelestials],
          jupiter,
        ));
    });

    describe('Luna (as admin) should see posts in Selenites group from Venus who banned her', () => {
      beforeEach(() => Promise.all([banUser(venus, luna), setBansDisabled(selenites, luna)]));

      it(`should not see to Celestials group only`, () =>
        shouldNotSeePost(postFormVenusToCelestials, luna));

      it(`should see post to Selenites group only`, () =>
        shouldSeePost(postFormVenusToSelenites, luna));

      it(`should see post to Selenites and Celestial groups`, () =>
        shouldSeePost(postFormVenusToSelenitesAndCelestials, luna));

      it(`should read all posts from Venus in Selenites groups`, () =>
        shouldReadFeed(
          selenites.username,
          [postFormVenusToSelenites, postFormVenusToSelenitesAndCelestials],
          luna,
        ));

      it(`should read only one post from Venus in Celestials groups`, () =>
        shouldReadFeed(celestials.username, [postFormVenusToSelenitesAndCelestials], luna));

      it(`should find posts 'from:venus' only from Selenites group`, () =>
        shouldFindPosts(
          'from:venus',
          [postFormVenusToSelenites, postFormVenusToSelenitesAndCelestials],
          luna,
        ));

      it(`should find posts with 'in-body:venus' only from Selenites group`, () =>
        shouldFindPosts(
          'venus',
          [postFormVenusToSelenites, postFormVenusToSelenitesAndCelestials],
          luna,
        ));
    });
  });
});

// Helpers

async function shouldSeePost(post, viewer = null) {
  const resp = await performJSONRequest('GET', `/v2/posts/${post.id}`, null, authHeaders(viewer));
  expect(resp, 'to satisfy', { __httpCode: 200 });
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
