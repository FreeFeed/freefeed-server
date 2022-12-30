/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../dbCleaner';

import {
  authHeaders,
  createTestUser,
  performJSONRequest,
  withModifiedAppConfig,
} from './functional_test_helper';
/** @typedef {import('../../app/models').User} User */

describe('User registration by invites', () => {
  beforeEach(() => cleanDB($pg_database));

  /** @type {User} */
  let luna;
  beforeEach(async () => (luna = await createTestUser('luna')));

  it(`should be null in 'invitedBy' field of Luna info`, async () => {
    const resp = await performJSONRequest('GET', `/v1/users/${luna.username}`);
    expect(resp, 'to satisfy', { __httpCode: 200, invitedBy: null });
  });

  describe('Luna invites Mars', () => {
    const invitationData = {
      message: 'Welcome to Freefeed!',
      lang: 'en',
      singleUse: true,
      users: ['luna'],
      groups: [],
    };

    beforeEach(async () => {
      let resp = await performJSONRequest(
        'POST',
        '/v2/invitations',
        invitationData,
        authHeaders(luna),
      );
      expect(resp, 'to satisfy', { __httpCode: 200 });
      const invitation = resp.invitation.secure_id;

      // Create Mars
      resp = await await performJSONRequest('POST', '/v1/users', {
        username: 'mars',
        password: 'pw',
        invitation,
      });
      expect(resp, 'to satisfy', { __httpCode: 200 });
    });

    it(`should be 'luna' in 'invitedBy' field of Mars info`, async () => {
      const resp = await performJSONRequest('GET', `/v1/users/mars`);
      expect(resp, 'to satisfy', { __httpCode: 200, invitedBy: luna.username });
    });
  });

  describe('Invitations are required', () => {
    withModifiedAppConfig({ invitations: { requiredForSignUp: true } });

    it('should not allow to register without invite', async () => {
      const resp = await await performJSONRequest('POST', '/v1/users', {
        username: 'mars',
        password: 'pw',
      });
      expect(resp, 'to satisfy', { __httpCode: 422 });
    });

    describe('Luna created invite', () => {
      const invitationData = {
        message: 'Welcome to Freefeed!',
        lang: 'en',
        singleUse: true,
        users: ['luna'],
        groups: [],
      };
      let invitation;

      beforeEach(async () => {
        const resp = await performJSONRequest(
          'POST',
          '/v2/invitations',
          invitationData,
          authHeaders(luna),
        );
        expect(resp, 'to satisfy', { __httpCode: 200 });
        invitation = resp.invitation.secure_id;
      });

      it('should allow to register with invite', async () => {
        const resp = await await performJSONRequest('POST', '/v1/users', {
          username: 'mars',
          password: 'pw',
          invitation,
        });
        expect(resp, 'to satisfy', { __httpCode: 200 });
      });

      describe('Invites was disabled for Luna', () => {
        beforeEach(() => luna.user.setInvitesDisabled(true));

        it('should not allow to register with invite', async () => {
          const resp = await await performJSONRequest('POST', '/v1/users', {
            username: 'mars',
            password: 'pw',
            invitation,
          });
          expect(resp, 'to satisfy', { __httpCode: 422 });
        });
      });
    });
  });
});
