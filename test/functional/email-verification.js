/* eslint-env node, mocha */
/* global $pg_database */
import config from 'config';
import expect from 'unexpected';
import { simpleParser } from 'mailparser';

import cleanDB from '../dbCleaner';
import { dbAdapter } from '../../app/models';

import {
  authHeaders,
  createTestUser,
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
});
