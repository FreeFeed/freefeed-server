/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../dbCleaner'
import { dbAdapter, User } from '../../app/models';

import { createTestUsers, mutualSubscriptions, createAndReturnPost, performJSONRequest, authHeaders } from './functional_test_helper';


describe('Gone users', () => {
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

  describe(`Gone user's timelines`, () => {
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

  describe(`Subscriptions`, () => {
    it(`should show Luna in Mars subscribers`, async () => {
      const resp = await performJSONRequest('GET', `/v1/users/${mars.username}/subscribers`);
      expect(resp, 'to satisfy', { subscribers: [{ id: luna.user.id }] });
    });

    it(`should allow Mars to unsubscribe Luna from themself`, async () => {
      const resp = await performJSONRequest('POST', `/v1/users/${luna.username}/unsubscribeFromMe`,
        null, authHeaders(mars));
      expect(resp, 'to satisfy', { __httpCode: 200 });
    });

    it(`should allow Mars to unsubscribe from Luna`, async () => {
      const resp = await performJSONRequest('POST', `/v1/users/${luna.username}/unsubscribe`,
        null, authHeaders(mars));
      expect(resp, 'to satisfy', { __httpCode: 200 });
    });

    describe(`Mars unsubscribed from Luna`, () => {
      beforeEach(() => performJSONRequest('POST', `/v1/users/${luna.username}/unsubscribe`,
        null, authHeaders(mars)));

      it(`should not allow Mars to subscribe to Luna again`, async () => {
        const resp = await performJSONRequest('POST', `/v1/users/${luna.username}/subscribe`,
          null, authHeaders(mars));
        expect(resp, 'to satisfy', { __httpCode: 403 });
      });

      it(`should not allow Mars to send subscription request to Luna`, async () => {
        const resp = await performJSONRequest('POST', `/v1/users/${luna.username}/sendRequest`,
          null, authHeaders(mars));
        expect(resp, 'to satisfy', { __httpCode: 403 });
      });
    });
  });

  describe(`Bans`, () => {
    it(`should allow Mars to ban Luna`, async () => {
      const resp = await performJSONRequest('POST', `/v1/users/${luna.username}/ban`,
        null, authHeaders(mars));
      expect(resp, 'to satisfy', { __httpCode: 200 });
    });
    it(`should allow Mars to unban Luna`, async () => {
      await performJSONRequest('POST', `/v1/users/${luna.username}/ban`,
        null, authHeaders(mars));
      const resp = await performJSONRequest('POST', `/v1/users/${luna.username}/unban`,
        null, authHeaders(mars));
      expect(resp, 'to satisfy', { __httpCode: 200 });
    });
  });
});
