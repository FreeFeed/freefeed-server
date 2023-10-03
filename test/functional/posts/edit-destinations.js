/* eslint-env node, mocha */
/* global  $pg_database */
import expect from 'unexpected';

import cleanDB from '../../dbCleaner';
import {
  createTestUsers,
  mutualSubscriptions,
  createAndReturnPostToFeed,
  performJSONRequest,
  authHeaders,
  createGroupAsync,
  groupToPrivate,
} from '../functional_test_helper';
import { GONE_SUSPENDED } from '../../../app/models/user';

describe('Update destinations of existing post', () => {
  let luna, mars;
  let post;

  beforeEach(async () => {
    await cleanDB($pg_database);

    [luna, mars] = await createTestUsers(['luna', 'mars']);
  });

  describe('Luna sent direct message to Mars, Mars decide to delete his account', () => {
    beforeEach(async () => {
      await mutualSubscriptions([luna, mars]);

      // Luna sent direct message to Mars
      post = await createAndReturnPostToFeed([mars], luna, 'Hello, Mars!');

      // Mars decide to delete his account
      await mars.user.setGoneStatus(GONE_SUSPENDED);
    });

    it(`should allow Luna to update the direct post without 'feeds' field`, async () => {
      const resp = await performJSONRequest(
        'PUT',
        `/v2/posts/${post.id}`,
        { post: { body: 'Bye, Mars:(' } },
        authHeaders(luna),
      );

      expect(resp, 'to satisfy', { __httpCode: 200 });
    });

    it(`should allow Luna to update the direct post with 'feeds' field`, async () => {
      const resp = await performJSONRequest(
        'PUT',
        `/v2/posts/${post.id}`,
        { post: { body: 'Bye, Mars:(', feeds: [mars.username] } },
        authHeaders(luna),
      );

      expect(resp, 'to satisfy', { __httpCode: 200 });
    });

    it(`should not allow Luna to create new direct message to Mars`, async () => {
      const resp = await performJSONRequest(
        'POST',
        `/v2/posts`,
        { post: { body: 'Mars, where are you?' }, meta: { feeds: [mars.username] } },
        authHeaders(luna),
      );

      expect(resp, 'to satisfy', { __httpCode: 403 });
    });
  });

  describe('Luna wrote post to group, group became private', () => {
    let celestials;
    beforeEach(async () => {
      celestials = await createGroupAsync(mars, 'celestials', 'Celestials');

      post = await createAndReturnPostToFeed([celestials, luna], luna, 'Hello, world!');
      await groupToPrivate(celestials.group, mars);
    });

    it(`should allow Luna to update the post without 'feeds' field`, async () => {
      const resp = await performJSONRequest(
        'PUT',
        `/v2/posts/${post.id}`,
        { post: { body: 'Hello again?' } },
        authHeaders(luna),
      );

      expect(resp, 'to satisfy', { __httpCode: 200 });
    });

    it(`should allow Luna to update the post with 'feeds' field`, async () => {
      const resp = await performJSONRequest(
        'PUT',
        `/v2/posts/${post.id}`,
        { post: { body: 'Hello again?', feeds: [luna.username, celestials.username] } },
        authHeaders(luna),
      );

      expect(resp, 'to satisfy', { __httpCode: 200 });
    });

    it(`should not allow Luna to create new post in private group`, async () => {
      const resp = await performJSONRequest(
        'POST',
        `/v2/posts`,
        { post: { body: 'Hello again?' }, meta: { feeds: [luna.username, celestials.username] } },
        authHeaders(luna),
      );

      expect(resp, 'to satisfy', { __httpCode: 403 });
    });
  });
});
