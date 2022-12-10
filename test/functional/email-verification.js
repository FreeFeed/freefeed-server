/* eslint-env node, mocha */
/* global $pg_database */
import { parse as qsParse } from 'querystring';

import config from 'config';
import expect from 'unexpected';
import { simpleParser } from 'mailparser';

import cleanDB from '../dbCleaner';
import { dbAdapter } from '../../app/models';
import { SIGN_IN_USER_EXISTS } from '../../app/support/ExtAuth';

import {
  authHeaders,
  createTestUser,
  createUserAsync,
  performJSONRequest,
  withEmailCapture,
  withModifiedAppConfig,
} from './functional_test_helper';

const codesConfig = config.emailVerification.codes;

describe('Email verification', () => {
  beforeEach(() => cleanDB($pg_database));

  // Turn email verification on for these tests
  withModifiedAppConfig({
    emailVerification: { enabled: true },
  });

  describe('Send verification codes', () => {
    const capturedMail = withEmailCapture();

    it(`should return error if email address is not valid`, async () => {
      const resp = await performJSONRequest('POST', `/v2/users/verifyEmail`, { email: 'foo' });
      expect(resp, 'to satisfy', { __httpCode: 422 });
    });

    it(`should not send email to blocked address`, async () => {
      const email = 'foo@bar.bad.com';
      const resp = await performJSONRequest('POST', `/v2/users/verifyEmail`, { email });
      expect(resp, 'to satisfy', { __httpCode: 200 });

      expect(capturedMail.current, 'to be null');
    });

    it(`should send email with code`, async () => {
      const email = 'foo@bar.baz';
      const resp = await performJSONRequest('POST', `/v2/users/verifyEmail`, { email });
      expect(resp, 'to satisfy', { __httpCode: 200 });

      expect(capturedMail.current, 'to satisfy', { envelope: { to: [email] } });
      const parsedMail = await simpleParser(capturedMail.current.response);
      const [, code] = /code: (\w+)$/.exec(parsedMail.subject);

      // Check it in database
      let exists = await dbAdapter.checkEmailVerificationCode(code, email);
      expect(exists, 'to be true');

      // Should not exists after the first check
      exists = await dbAdapter.checkEmailVerificationCode(code, email);
      expect(exists, 'to be false');
    });

    it(`should not send too many emails`, async () => {
      const email = 'foo@bar.baz';
      const limit = codesConfig.limitPerEmail.count;

      for (let i = 0; i < limit; i++) {
        // eslint-disable-next-line no-await-in-loop
        const resp = await performJSONRequest('POST', `/v2/users/verifyEmail`, { email });
        expect(resp, 'to satisfy', { __httpCode: 200 });
      }

      const resp = await performJSONRequest('POST', `/v2/users/verifyEmail`, { email });
      expect(resp, 'to satisfy', { __httpCode: 429 });
    });

    describe(`Different modes when some user exists`, () => {
      const email = 'luna@example.com';
      beforeEach(() => createUserAsync('luna', 'pw', { email }));

      it(`should send warning in 'sign-in' mode with existing address`, async () => {
        const resp = await performJSONRequest('POST', `/v2/users/verifyEmail`, {
          email: 'luna@example.com',
          mode: 'sign-up',
        });
        expect(resp, 'to satisfy', { __httpCode: 200 });

        const parsedMail = await simpleParser(capturedMail.current.response);
        expect(parsedMail.text, 'to satisfy', /WARNING:/);
        expect(
          parsedMail.text,
          'to satisfy',
          /Registering multiple accounts with the same email is not possible./,
        );
      });

      it(`should send warning in 'sign-in' mode with existing norm address`, async () => {
        const resp = await performJSONRequest('POST', `/v2/users/verifyEmail`, {
          email: 'luna+1@example.com',
          mode: 'sign-up',
        });
        expect(resp, 'to satisfy', { __httpCode: 200 });

        const parsedMail = await simpleParser(capturedMail.current.response);
        expect(parsedMail.text, 'to satisfy', /WARNING:/);
        expect(
          parsedMail.text,
          'to satisfy',
          /Registering multiple accounts with the same email is not possible./,
        );
      });

      it(`should send warning in 'update' mode with existing address`, async () => {
        const resp = await performJSONRequest('POST', `/v2/users/verifyEmail`, {
          email: 'luna@example.com',
          mode: 'update',
        });
        expect(resp, 'to satisfy', { __httpCode: 200 });

        const parsedMail = await simpleParser(capturedMail.current.response);
        expect(
          parsedMail.text,
          'to satisfy',
          /WARNING: We already have a @luna account with this email address./,
        );
      });

      it(`should not send warning in 'update' mode with existing norm address`, async () => {
        const resp = await performJSONRequest('POST', `/v2/users/verifyEmail`, {
          email: 'luna+1@example.com',
          mode: 'update',
        });
        expect(resp, 'to satisfy', { __httpCode: 200 });

        const parsedMail = await simpleParser(capturedMail.current.response);
        expect(parsedMail.text, 'not to satisfy', /WARNING:/);
      });
    });
  });

  describe('Update email in profile', () => {
    let luna;
    beforeEach(async () => (luna = await createTestUser('luna')));

    describe('User without an address initially', () => {
      const email = 'luna@example.com';

      it(`should allow to update without email field`, async () => {
        const resp = await performJSONRequest(
          'PUT',
          `/v1/users/${luna.user.id}`,
          { user: { screenName: 'Just Luna' } },
          authHeaders(luna),
        );
        expect(resp, 'to satisfy', { __httpCode: 200 });
      });

      it(`should allow to send empty email field`, async () => {
        const resp = await performJSONRequest(
          'PUT',
          `/v1/users/${luna.user.id}`,
          { user: { email: '' } },
          authHeaders(luna),
        );
        expect(resp, 'to satisfy', { __httpCode: 200 });
      });

      it(`should not allow to set email without code`, async () => {
        const resp = await performJSONRequest(
          'PUT',
          `/v1/users/${luna.user.id}`,
          { user: { email } },
          authHeaders(luna),
        );
        expect(resp, 'to satisfy', { __httpCode: 422 });
      });

      it(`should not allow to set email with invalid code`, async () => {
        const resp = await performJSONRequest(
          'PUT',
          `/v1/users/${luna.user.id}`,
          { user: { email }, emailVerificationCode: '123456' },
          authHeaders(luna),
        );
        expect(resp, 'to satisfy', { __httpCode: 422 });
      });

      it(`should allow to set email with valid code`, async () => {
        const emailVerificationCode = await dbAdapter.createEmailVerificationCode(email, '::1');
        const resp = await performJSONRequest(
          'PUT',
          `/v1/users/${luna.user.id}`,
          { user: { email }, emailVerificationCode },
          authHeaders(luna),
        );
        expect(resp, 'to satisfy', { __httpCode: 200, users: { email } });
      });
    });

    describe('User with an address', () => {
      const email = 'luna@example.com';
      const newEmail = 'luna+mars@example.com';
      beforeEach(async () => {
        const emailVerificationCode = await dbAdapter.createEmailVerificationCode(email, '::1');
        await performJSONRequest(
          'PUT',
          `/v1/users/${luna.user.id}`,
          { user: { email }, emailVerificationCode },
          authHeaders(luna),
        );
      });

      it(`should allow to send empty the same email`, async () => {
        const resp = await performJSONRequest(
          'PUT',
          `/v1/users/${luna.user.id}`,
          { user: { email: '' } },
          authHeaders(luna),
        );
        expect(resp, 'to satisfy', { __httpCode: 422 });
      });

      it(`should not allow to send empty email field`, async () => {
        const resp = await performJSONRequest(
          'PUT',
          `/v1/users/${luna.user.id}`,
          { user: { email: '' } },
          authHeaders(luna),
        );
        expect(resp, 'to satisfy', { __httpCode: 422 });
      });

      it(`should not allow to set new email without code`, async () => {
        const resp = await performJSONRequest(
          'PUT',
          `/v1/users/${luna.user.id}`,
          { user: { email: newEmail } },
          authHeaders(luna),
        );
        expect(resp, 'to satisfy', { __httpCode: 422 });
      });

      it(`should allow to set new email with valid code`, async () => {
        const emailVerificationCode = await dbAdapter.createEmailVerificationCode(newEmail, '::1');
        const resp = await performJSONRequest(
          'PUT',
          `/v1/users/${luna.user.id}`,
          { user: { email: newEmail }, emailVerificationCode },
          authHeaders(luna),
        );
        expect(resp, 'to satisfy', { __httpCode: 200, users: { email: newEmail } });
      });
    });
  });

  describe('Create user', () => {
    describe('Create user without external profile', () => {
      const email = 'luna@example.com';

      it('should not create user without email', async () => {
        const resp = await performJSONRequest('POST', `/v1/users`, {
          username: 'luna',
          screenName: 'luna',
          password: 'pw',
        });
        expect(resp, 'to satisfy', { __httpCode: 422 });
      });

      it('should not create user with email but without code', async () => {
        const resp = await performJSONRequest('POST', `/v1/users`, {
          username: 'luna',
          screenName: 'luna',
          password: 'pw',
          email,
        });
        expect(resp, 'to satisfy', { __httpCode: 422 });
      });

      it('should not create user with invalid code', async () => {
        const resp = await performJSONRequest('POST', `/v1/users`, {
          username: 'luna',
          screenName: 'luna',
          password: 'pw',
          email,
          emailVerificationCode: '123456',
        });
        expect(resp, 'to satisfy', { __httpCode: 422 });
      });

      it('should create user with email and valid code', async () => {
        const emailVerificationCode = await dbAdapter.createEmailVerificationCode(email, '::1');
        const resp = await performJSONRequest('POST', `/v1/users`, {
          username: 'luna',
          screenName: 'luna',
          password: 'pw',
          email,
          emailVerificationCode,
        });
        expect(resp, 'to satisfy', { __httpCode: 200, users: { username: 'luna', email } });
      });
    });

    describe('Create user with external profile not having email', () => {
      let externalProfileKey;
      beforeEach(async () => {
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
        const redirectParams = qsParse(new URL(resp.redirectTo).search.substring(1));

        // Finalizing flow
        resp = await performJSONRequest('POST', '/v2/ext-auth/auth-finish', {
          provider: 'test',
          query: { code: '12345', state: redirectParams.state },
        });

        ({ externalProfileKey } = resp); // also resp.profile.email
      });

      const email = 'luna@example.com';

      it('should not create user without email', async () => {
        const resp = await performJSONRequest('POST', `/v1/users`, {
          username: 'luna',
          screenName: 'luna',
          password: 'pw',
          externalProfileKey,
        });
        expect(resp, 'to satisfy', { __httpCode: 422 });
      });

      it('should not create user with email but without code', async () => {
        const resp = await performJSONRequest('POST', `/v1/users`, {
          username: 'luna',
          screenName: 'luna',
          password: 'pw',
          email,
          externalProfileKey,
        });
        expect(resp, 'to satisfy', { __httpCode: 422 });
      });

      it('should not create user with invalid code', async () => {
        const resp = await performJSONRequest('POST', `/v1/users`, {
          username: 'luna',
          screenName: 'luna',
          password: 'pw',
          email,
          emailVerificationCode: '123456',
          externalProfileKey,
        });
        expect(resp, 'to satisfy', { __httpCode: 422 });
      });

      it('should create user with email and valid code', async () => {
        const emailVerificationCode = await dbAdapter.createEmailVerificationCode(email, '::1');
        const resp = await performJSONRequest('POST', `/v1/users`, {
          username: 'luna',
          screenName: 'luna',
          password: 'pw',
          email,
          emailVerificationCode,
          externalProfileKey,
        });
        expect(resp, 'to satisfy', { __httpCode: 200, users: { username: 'luna', email } });
      });
    });

    describe('Create user with external profile having email', () => {
      const email = 'luna@example.com';
      const alteredEmail = 'luna+mars@example.com';
      let externalProfileKey;
      beforeEach(async () => {
        // Ubtaining auth URL
        const authParams = {
          provider: 'test',
          redirectURL: 'http://localhost/callback',
          mode: 'sign-in',
          // Test values
          externalId: '111',
          externalName: 'Luna Lovegood',
          externalEmail: email,
        };

        let resp = await performJSONRequest('POST', '/v2/ext-auth/auth-start', authParams);
        const redirectParams = qsParse(new URL(resp.redirectTo).search.substring(1));

        // Finalizing flow
        resp = await performJSONRequest('POST', '/v2/ext-auth/auth-finish', {
          provider: 'test',
          query: { code: '12345', state: redirectParams.state },
        });

        ({ externalProfileKey } = resp); // also resp.profile.email
      });

      it('should not create user without email', async () => {
        const resp = await performJSONRequest('POST', `/v1/users`, {
          username: 'luna',
          screenName: 'luna',
          password: 'pw',
          externalProfileKey,
        });
        expect(resp, 'to satisfy', { __httpCode: 422 });
      });

      it('should create user with email but without code', async () => {
        const resp = await performJSONRequest('POST', `/v1/users`, {
          username: 'luna',
          screenName: 'luna',
          password: 'pw',
          email,
          externalProfileKey,
        });
        expect(resp, 'to satisfy', { __httpCode: 200, users: { email } });
      });

      it('should not create user with altered email but without code', async () => {
        const resp = await performJSONRequest('POST', `/v1/users`, {
          username: 'luna',
          screenName: 'luna',
          password: 'pw',
          email: alteredEmail,
          externalProfileKey,
        });
        expect(resp, 'to satisfy', { __httpCode: 422 });
      });

      it('should not create user with invalid code', async () => {
        const resp = await performJSONRequest('POST', `/v1/users`, {
          username: 'luna',
          screenName: 'luna',
          password: 'pw',
          email: alteredEmail,
          emailVerificationCode: '123456',
          externalProfileKey,
        });
        expect(resp, 'to satisfy', { __httpCode: 422 });
      });

      it('should create user with email and valid code', async () => {
        const emailVerificationCode = await dbAdapter.createEmailVerificationCode(
          alteredEmail,
          '::1',
        );
        const resp = await performJSONRequest('POST', `/v1/users`, {
          username: 'luna',
          screenName: 'luna',
          password: 'pw',
          email: alteredEmail,
          emailVerificationCode,
          externalProfileKey,
        });
        expect(resp, 'to satisfy', {
          __httpCode: 200,
          users: { username: 'luna', email: alteredEmail },
        });
      });
    });
  });

  describe('Email normalization effects', () => {
    beforeEach(() =>
      Promise.all([
        createUserAsync('luna', 'pw', { email: 'luna@example.com' }),
        createUserAsync('luna2', 'pw', { email: 'luna+2@example.com' }),
      ]),
    );

    describe('New user registration', () => {
      it(`should not allow to create user with exactly same email`, async () => {
        const email = 'luna@example.com';
        const emailVerificationCode = await dbAdapter.createEmailVerificationCode(email, '::1');
        const resp = await performJSONRequest('POST', `/v1/users`, {
          username: 'mars',
          password: 'pw',
          email,
          emailVerificationCode,
        });
        expect(resp, 'to satisfy', {
          __httpCode: 422,
          err: 'This email address is already in use',
        });
      });

      it(`should not allow to create user with same normalized email`, async () => {
        const email = 'luna+mars@example.com';
        const emailVerificationCode = await dbAdapter.createEmailVerificationCode(email, '::1');
        const resp = await performJSONRequest('POST', `/v1/users`, {
          username: 'mars',
          password: 'pw',
          email,
          emailVerificationCode,
        });
        expect(resp, 'to satisfy', {
          __httpCode: 422,
          err: 'This email address is already in use',
        });
      });

      it(`should allow to create user with different email`, async () => {
        const email = 'mars@example.com';
        const emailVerificationCode = await dbAdapter.createEmailVerificationCode(email, '::1');
        const resp = await performJSONRequest('POST', `/v1/users`, {
          username: 'mars',
          password: 'pw',
          email,
          emailVerificationCode,
        });
        expect(resp, 'to satisfy', { __httpCode: 200, users: { username: 'mars', email } });
      });
    });

    describe(`External authorization`, () => {
      it('should detect existing normalized email', async () => {
        const email = 'luna+mars@example.com';

        // Ubtaining auth URL
        const authParams = {
          provider: 'test',
          redirectURL: 'http://localhost/callback',
          mode: 'sign-in',
          // Test values
          externalId: '111',
          externalName: 'Luna Lovegood',
          externalEmail: email,
        };

        let resp = await performJSONRequest('POST', '/v2/ext-auth/auth-start', authParams);
        const redirectParams = qsParse(new URL(resp.redirectTo).search.substring(1));

        // Finalizing flow
        resp = await performJSONRequest('POST', '/v2/ext-auth/auth-finish', {
          provider: 'test',
          query: { code: '12345', state: redirectParams.state },
        });

        expect(resp, 'to satisfy', { status: SIGN_IN_USER_EXISTS });
      });
    });

    describe(`Password reset`, () => {
      const emails = withEmailCapture({ multiple: true });

      it('should send password reset links to all users with the same norm. emails', async () => {
        const resp = await performJSONRequest('POST', '/v1/passwords', {
          email: 'luna+3@example.com',
        });

        expect(resp, 'to satisfy', { __httpCode: 200 });
        expect(emails.current, 'to have length', 2);
        expect(emails.current, 'to have an item satisfying', {
          envelope: { to: ['luna@example.com'] },
        });
        expect(emails.current, 'to have an item satisfying', {
          envelope: { to: ['luna+2@example.com'] },
        });
      });
    });
  });
});
