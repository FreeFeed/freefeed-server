/* eslint-env node, mocha */
/* global $pg_database */
import { parse as qsParse } from 'querystring';
import { URL } from 'url';

import expect from 'unexpected';

import cleanDB from '../dbCleaner';
import { dbAdapter } from '../../app/models';

import { authHeaders, createTestUser, performJSONRequest } from './functional_test_helper';

describe('User freeze', () => {
  /** @type {import('../../app/models').User} */
  let luna;

  beforeEach(() => cleanDB($pg_database));

  describe(`Luna is frozen`, () => {
    const extAuthParams = {
      provider: 'test',
      redirectURL: 'http://localhost/callback',
      // Test values
      externalId: '111',
      externalName: 'Luna Lovegood',
    };

    beforeEach(async () => {
      luna = await createTestUser('luna');

      // Luna has connected external profile
      let resp = await performJSONRequest('POST', '/v2/ext-auth/auth-start', {
        ...extAuthParams,
        mode: 'connect',
      });
      const redirectParams = qsParse(new URL(resp.redirectTo).search.substring(1));
      resp = await performJSONRequest(
        'POST',
        '/v2/ext-auth/auth-finish',
        { provider: 'test', query: { code: '12345', state: redirectParams.state } },
        { Authorization: `Bearer ${luna.authToken}` },
      );

      // Freeze!
      await freeze(luna.user.id, 'PT10S');
    });

    it(`should not allow Luna to sign in by login and password`, async () => {
      const resp = await performJSONRequest('POST', '/v1/session', {
        username: luna.username,
        password: luna.password,
      });
      expect(resp, 'to satisfy', { __httpCode: 401, err: /suspended due to suspicious activity/ });
    });

    it(`should not allow Luna to sign in by external provider`, async () => {
      let resp = await performJSONRequest('POST', '/v2/ext-auth/auth-start', {
        ...extAuthParams,
        mode: 'sign-in',
      });
      const redirectParams = qsParse(new URL(resp.redirectTo).search.substring(1));
      resp = await performJSONRequest('POST', '/v2/ext-auth/auth-finish', {
        provider: 'test',
        query: { code: '12345', state: redirectParams.state },
      });

      expect(resp, 'to satisfy', { __httpCode: 401, err: /suspended due to suspicious activity/ });
    });

    it(`should not allow Luna to perform any request`, async () => {
      const resp = await performJSONRequest('GET', '/v1/users/me', null, authHeaders(luna));
      expect(resp, 'to satisfy', { __httpCode: 401, err: /suspended due to suspicious activity/ });
    });
  });
});

async function freeze(userId, freezeTime) {
  const user = await dbAdapter.getUserById(userId);
  await user.freeze(freezeTime);
}
