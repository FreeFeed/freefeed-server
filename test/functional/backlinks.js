/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../dbCleaner';

import {
  authHeaders,
  // authHeaders,
  createAndReturnPost,
  createTestUsers,
  goPrivate,
  goPublic,
  // goPrivate,
  // goPublic,
  performJSONRequest,
} from './functional_test_helper';

describe('Backlinks', () => {
  let luna, mars;
  let lunaPostId;

  before(async () => {});

  before(async () => {
    await cleanDB($pg_database);
    [luna, mars] = await createTestUsers(['luna', 'mars']);

    ({ id: lunaPostId } = await createAndReturnPost(luna, 'Luna post'));
    await createAndReturnPost(mars, `As Luna said, ${lunaPostId}`);
  });

  it(`should return Luna post with 1 backlink`, async () => {
    const resp = await performJSONRequest('GET', `/v2/posts/${lunaPostId}`);
    expect(resp, 'to satisfy', { posts: { backlinksCount: 1 } });
  });

  describe('Mars becomes private', () => {
    before(() => goPrivate(mars));
    after(() => goPublic(mars));

    it(`should return Luna post with 0 backlinks to anonymous`, async () => {
      const resp = await performJSONRequest('GET', `/v2/posts/${lunaPostId}`);
      expect(resp, 'to satisfy', { posts: { backlinksCount: 0 } });
    });

    it(`should return Luna post with 0 backlinks to Luna`, async () => {
      const resp = await performJSONRequest(
        'GET',
        `/v2/posts/${lunaPostId}`,
        null,
        authHeaders(luna),
      );
      expect(resp, 'to satisfy', { posts: { backlinksCount: 0 } });
    });

    it(`should return Luna post with 1 backlink to Mars`, async () => {
      const resp = await performJSONRequest(
        'GET',
        `/v2/posts/${lunaPostId}`,
        null,
        authHeaders(mars),
      );
      expect(resp, 'to satisfy', { posts: { backlinksCount: 1 } });
    });
  });
});
