/* eslint-env node, mocha */
/* global $pg_database */
import { URL } from 'url';
import { parse as qsParse } from 'querystring';

import jwt from 'jsonwebtoken';
import expect from 'unexpected';

import cleanDB from '../dbCleaner';
import { dbAdapter, SessionTokenV1 } from '../../app/models';
import {
  getAuthProvider,
  SIGN_IN_SUCCESS,
  SIGN_IN_USER_EXISTS,
  SIGN_IN_CONTINUE,
} from '../../app/support/ExtAuth';

import { createTestUsers, performJSONRequest, createUserAsync } from './functional_test_helper';
import { extAuthProfilesResponse, externalProfile } from './schemaV2-helper';

describe('ExtAuthController base methods', () => {
  let luna;
  let lunaToken, marsToken;
  let lunaProfile1, lunaProfile2;

  before(async () => {
    await cleanDB($pg_database);

    await Promise.all(
      (await createTestUsers(2)).map(async ({ authToken, user }, i) => {
        if (i === 0) {
          lunaToken = authToken;
          luna = await dbAdapter.getUserById(user.id);
        } else {
          marsToken = authToken;
        }
      }),
    );

    lunaProfile1 = await luna.addOrUpdateExtProfile({
      provider: 'facebook',
      externalId: '111',
      title: 'Luna Lovegood',
    });
    lunaProfile2 = await luna.addOrUpdateExtProfile({
      provider: 'facebook',
      externalId: '112',
      title: 'Luna Maximoff',
    });
  });

  it('should not return profile list to anonymous', async () => {
    const result = await performJSONRequest('GET', '/v2/ext-auth/profiles', null);
    expect(result, 'to satisfy', { __httpCode: 401 });
  });

  it('should return Luna profile list', async () => {
    const result = await performJSONRequest('GET', '/v2/ext-auth/profiles', null, {
      Authorization: `Bearer ${lunaToken}`,
    });
    expect(result, 'to satisfy', extAuthProfilesResponse);
    expect(result, 'to satisfy', { profiles: [{ id: lunaProfile2.id }, { id: lunaProfile1.id }] });
  });

  it('should not allow to Mars to remove Luna profile', async () => {
    const result = await performJSONRequest(
      'DELETE',
      `/v2/ext-auth/profiles/${lunaProfile1.id}`,
      {},
      { Authorization: `Bearer ${marsToken}` },
    );
    expect(result, 'to satisfy', { __httpCode: 404 });
  });

  it('should allow to Luna to remove her profile', async () => {
    const result = await performJSONRequest(
      'DELETE',
      `/v2/ext-auth/profiles/${lunaProfile1.id}`,
      {},
      { Authorization: `Bearer ${lunaToken}` },
    );
    expect(result, 'to satisfy', { __httpCode: 200 });
  });

  it('should return modified Luna profile list', async () => {
    const result = await performJSONRequest('GET', '/v2/ext-auth/profiles', null, {
      Authorization: `Bearer ${lunaToken}`,
    });
    expect(result, 'to satisfy', { profiles: [{ id: lunaProfile2.id }] });
  });
});

describe('ExtAuthController authorization flow', () => {
  let luna, mars;

  before(async () => {
    await cleanDB($pg_database);

    luna = await createUserAsync('luna', 'pw', { email: 'luna@example.com' });
    mars = await createUserAsync('mars', 'pw', { email: 'mars@example.com' });
  });

  describe('Connecting profile', () => {
    it('should connect profile from test provider to Luna', async () => {
      const testProvider = getAuthProvider('test');

      // Ubtaining auth URL
      const authParams = {
        provider: 'test',
        redirectURL: 'http://localhost/callback',
        mode: 'connect',
        // Test values
        externalId: '111',
        externalName: 'Luna Lovegood',
      };

      let resp = await performJSONRequest('POST', '/v2/ext-auth/auth-start', authParams);
      expect(resp, 'to have key', 'redirectTo');
      expect(resp.redirectTo, 'to start with', testProvider.authorizeURL);

      const redirectParams = qsParse(new URL(resp.redirectTo).search.substr(1));
      expect(redirectParams, 'to satisfy', { state: expect.it('to be a string') });

      // Finalizing flow
      resp = await performJSONRequest(
        'POST',
        '/v2/ext-auth/auth-finish',
        { provider: 'test', query: { code: '12345', state: redirectParams.state } },
        { Authorization: `Bearer ${luna.authToken}` },
      );
      expect(resp, 'to satisfy', { profile: externalProfile });
    });

    it('should return modified Luna profile list', async () => {
      const result = await performJSONRequest('GET', '/v2/ext-auth/profiles', null, {
        Authorization: `Bearer ${luna.authToken}`,
      });
      expect(result, 'to satisfy', { profiles: [{ provider: 'test', title: 'Luna Lovegood' }] });
    });

    it('should not allow to other users to connect to the same profile', async () => {
      // Ubtaining auth URL
      const authParams = {
        provider: 'test',
        redirectURL: 'http://localhost/callback',
        mode: 'connect',
        // Test values
        externalId: '111',
        externalName: 'Luna Lovegood',
      };

      let resp = await performJSONRequest('POST', '/v2/ext-auth/auth-start', authParams);
      const redirectParams = qsParse(new URL(resp.redirectTo).search.substr(1));

      // Finalizing flow as Mars
      resp = await performJSONRequest(
        'POST',
        '/v2/ext-auth/auth-finish',
        { provider: 'test', query: { code: '12345', state: redirectParams.state } },
        { Authorization: `Bearer ${mars.authToken}` },
      );
      expect(resp, 'to satisfy', {
        err: expect.it('to contain', '@luna', 'Luna Lovegood'),
        __httpCode: 403,
      });
    });
  });

  describe('Signing In', () => {
    it('should sign in Luna', async () => {
      const testProvider = getAuthProvider('test');

      // Ubtaining auth URL
      const authParams = {
        provider: 'test',
        redirectURL: 'http://localhost/callback',
        mode: 'sign-in',
        // Test values
        externalId: '111',
        externalName: 'Luna Lovegood',
      };

      let resp = await performJSONRequest('POST', '/v2/ext-auth/auth-start', authParams);
      expect(resp, 'to have key', 'redirectTo');
      expect(resp.redirectTo, 'to start with', testProvider.authorizeURL);

      const redirectParams = qsParse(new URL(resp.redirectTo).search.substr(1));
      expect(redirectParams, 'to satisfy', { state: expect.it('to be a string') });

      // Finalizing flow
      resp = await performJSONRequest('POST', '/v2/ext-auth/auth-finish', {
        provider: 'test',
        query: { code: '12345', state: redirectParams.state },
      });
      expect(resp, 'to satisfy', {
        status: SIGN_IN_SUCCESS,
        authToken: expect.it('to be a string'),
        user: { username: 'luna' },
        profile: { provider: 'test', name: 'Luna Lovegood' },
      });

      // Checking the authToken
      expect(jwt.decode(resp.authToken), 'to satisfy', {
        type: SessionTokenV1.TYPE,
        id: expect.it('to be a string'),
        issue: 1,
        userId: luna.user.id,
      });

      resp = await performJSONRequest('GET', '/v1/users/me', null, {
        Authorization: `Bearer ${resp.authToken}`,
      });
      expect(resp, 'to satisfy', {
        users: { id: luna.user.id },
        __httpCode: 200,
      });
    });

    it('should return SIGN_IN_USER_EXISTS status if user with the given email exists', async () => {
      // Ubtaining auth URL
      const authParams = {
        provider: 'test',
        redirectURL: 'http://localhost/callback',
        mode: 'sign-in',
        // Test values
        externalId: '112',
        externalName: 'Marcus Antonius',
        externalEmail: 'mars@example.com',
      };

      let resp = await performJSONRequest('POST', '/v2/ext-auth/auth-start', authParams);
      const redirectParams = qsParse(new URL(resp.redirectTo).search.substr(1));

      // Finalizing flow
      resp = await performJSONRequest('POST', '/v2/ext-auth/auth-finish', {
        provider: 'test',
        query: { code: '12345', state: redirectParams.state },
      });
      expect(resp, 'to satisfy', { status: SIGN_IN_USER_EXISTS });
    });

    it('should return SIGN_IN_CONTINUE status if user with the given email is not exists', async () => {
      // Ubtaining auth URL
      const authParams = {
        provider: 'test',
        redirectURL: 'http://localhost/callback',
        mode: 'sign-in',
        // Test values
        externalId: '112',
        externalName: 'Marcus Antonius',
        externalEmail: 'marcus@example.com',
        externalPictureURL: 'http://localhost/marcus.jpg',
      };

      let resp = await performJSONRequest('POST', '/v2/ext-auth/auth-start', authParams);
      const redirectParams = qsParse(new URL(resp.redirectTo).search.substr(1));

      // Finalizing flow
      resp = await performJSONRequest('POST', '/v2/ext-auth/auth-finish', {
        provider: 'test',
        query: { code: '12345', state: redirectParams.state },
      });
      expect(resp, 'to satisfy', {
        status: SIGN_IN_CONTINUE,
        profile: {
          provider: 'test',
          name: 'Marcus Antonius',
          email: 'marcus@example.com',
          pictureURL: 'http://localhost/marcus.jpg',
        },
        suggestedUsername: 'marcus',
        externalProfileKey: expect.it('to be a string'),
      });
    });

    it('should register user with attached external profile', async () => {
      // Ubtaining auth URL
      const authParams = {
        provider: 'test',
        redirectURL: 'http://localhost/callback',
        mode: 'sign-in',
        // Test values
        externalId: '112',
        externalName: 'Marcus Antonius',
      };

      let resp = await performJSONRequest('POST', '/v2/ext-auth/auth-start', authParams);
      const redirectParams = qsParse(new URL(resp.redirectTo).search.substr(1));

      // Finalizing flow
      const { externalProfileKey } = await performJSONRequest('POST', '/v2/ext-auth/auth-finish', {
        provider: 'test',
        query: { code: '12345', state: redirectParams.state },
      });

      // Creating new user
      resp = await performJSONRequest('POST', '/v1/users', {
        username: 'marcus',
        // no password - it should be possible to register user without password
        externalProfileKey,
      });

      expect(resp, 'to satisfy', { users: { username: 'marcus' }, __httpCode: 200 });

      // Check the linked profile
      resp = await performJSONRequest('GET', '/v2/ext-auth/profiles', null, {
        Authorization: `Bearer ${resp.authToken}`,
      });
      expect(resp, 'to satisfy', {
        profiles: [{ provider: 'test', title: 'Marcus Antonius' }],
        __httpCode: 200,
      });
    });
  });

  describe('AuthError', () => {
    it('should throw error if "state" parameter is not valid', async () => {
      const resp = await performJSONRequest('POST', '/v2/ext-auth/auth-finish', {
        provider: 'test',
        query: { code: '12345', state: 'bad state' },
      });
      expect(resp, 'to satisfy', {
        err: expect.it('to contain', 'state'),
        __httpCode: 400,
      });
    });

    it('should throw error if no "code" parameter', async () => {
      const authParams = {
        provider: 'test',
        redirectURL: 'http://localhost/callback',
        mode: 'connect',
        // Test values
        externalId: '111',
        externalName: 'Luna Lovegood',
      };

      let resp = await performJSONRequest('POST', '/v2/ext-auth/auth-start', authParams);
      const redirectParams = qsParse(new URL(resp.redirectTo).search.substr(1));

      resp = await performJSONRequest('POST', '/v2/ext-auth/auth-finish', {
        provider: 'test',
        query: { state: redirectParams.state },
      });
      expect(resp, 'to satisfy', { __httpCode: 400 });
    });

    it('should throw error with "error_description" parameter', async () => {
      const authParams = {
        provider: 'test',
        redirectURL: 'http://localhost/callback',
        mode: 'connect',
        // Test values
        externalId: '111',
        externalName: 'Luna Lovegood',
      };

      let resp = await performJSONRequest('POST', '/v2/ext-auth/auth-start', authParams);
      const redirectParams = qsParse(new URL(resp.redirectTo).search.substr(1));

      resp = await performJSONRequest('POST', '/v2/ext-auth/auth-finish', {
        provider: 'test',
        query: { state: redirectParams.state, error_description: 'fooo' },
      });
      expect(resp, 'to satisfy', { __httpCode: 400, err: 'fooo' });
    });
  });
});
