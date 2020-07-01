/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../dbCleaner'
import { dbAdapter, User } from '../../app/models';

import { createTestUsers, mutualSubscriptions, createAndReturnPost, performJSONRequest, authHeaders } from './functional_test_helper';


describe('Gone users', () => {
  describe(`Gone user's timelines`, () => {
    beforeEach(() => cleanDB($pg_database));

    let luna, mars;
    beforeEach(async () => {
      [luna, mars] = await createTestUsers(['luna', 'mars']);
      await mutualSubscriptions([luna, mars]);
      // Luna writes a post
      await createAndReturnPost(luna, 'Luna post');
      // Luna is gone
      await dbAdapter.setUserGoneStatus(luna.user.id, User.GONE_SUSPENDED);
    });

    it(`should return Luna's Posts feed to anonymous with 'private' luna and without posts`, async () => {
      const resp = await performJSONRequest('GET', `/v2/timelines/${luna.username}`);
      expect(resp, 'to satisfy', {
        timelines:     { posts: [], subscribers: [] },
        users:         [{ id: luna.user.id, isProtected: '1', isPrivate: '1', isGone: true }],
        subscriptions: [],
        subscribers:   [],
        posts:         [],
      });
    });

    it(`should return Luna's Posts feed to Mars with 'private' luna and without posts`, async () => {
      const resp = await performJSONRequest('GET', `/v2/timelines/${luna.username}`, null, authHeaders(mars));
      expect(resp, 'to satisfy', {
        timelines:     { posts: [], subscribers: [] },
        users:         [{ id: luna.user.id, isProtected: '1', isPrivate: '1', isGone: true }],
        subscriptions: [],
        subscribers:   [],
        posts:         [],
      });
    });

    it(`should return empty Luna's timeline metatags`, async () => {
      const resp = await performJSONRequest('GET', `/v2/timelines-metatags/${luna.username}`);
      expect(resp, 'to satisfy', { __httpCode: 200, textResponse: '' });
    });
  });
});
