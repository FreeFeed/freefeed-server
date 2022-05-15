/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';
import { simpleParser } from 'mailparser';
import config from 'config';

import cleanDB from '../dbCleaner';
import { getSingleton } from '../../app/app';
import { DummyPublisher } from '../../app/pubsub';
import { dbAdapter, pubSub } from '../../app/models';
import { addMailListener } from '../../lib/mailer';

import { createUserAsync, performJSONRequest, updateUserAsync } from './functional_test_helper';

describe('PasswordsController', () => {
  before(async () => {
    await getSingleton();
    pubSub.setPublisher(new DummyPublisher());
  });

  describe('#create()', () => {
    let luna;
    const oldEmail = 'test@example.com';

    beforeEach(async () => {
      await cleanDB($pg_database);
      luna = await createUserAsync('Luna', 'password', { email: oldEmail });
    });

    it('should require email', async () => {
      const resp = await performJSONRequest('POST', '/v1/passwords', { email: '' });
      expect(resp, 'to satisfy', { __httpCode: 400, err: 'Email cannot be blank' });
    });

    it('should generate resetToken by original email of user', async () => {
      const resp = await performJSONRequest('POST', '/v1/passwords', { email: oldEmail });
      expect(resp, 'to satisfy', {
        __httpCode: 200,
        message: `Password reset link has been sent to ${oldEmail}`,
      });
    });

    it('should generate resetToken by new email of user', async () => {
      const email = 'luna@example.com';

      await updateUserAsync(luna, { email });

      {
        const resp = await performJSONRequest('POST', '/v1/passwords', { email: oldEmail });
        expect(resp, 'to satisfy', { __httpCode: 404 });
      }

      {
        const resp = await performJSONRequest('POST', '/v1/passwords', { email });
        expect(resp, 'to satisfy', {
          __httpCode: 200,
          message: `Password reset link has been sent to ${email}`,
        });
      }
    });

    it('should generate resetToken by email with capital letters', async () => {
      const email = 'Luna@example.com';

      await updateUserAsync(luna, { email });

      const resp = await performJSONRequest('POST', '/v1/passwords', { email });
      expect(resp, 'to satisfy', {
        __httpCode: 200,
        message: `Password reset link has been sent to ${email}`,
      });
    });
  });

  describe('#update()', () => {
    let luna;
    const email = 'luna@example.com';

    beforeEach(async () => {
      await cleanDB($pg_database);

      luna = await createUserAsync('Luna', 'password');
      await updateUserAsync(luna, { email });
      await performJSONRequest('POST', '/v1/passwords', { email });
    });

    it('should not reset password by invalid resetToken', async () => {
      const resp = await performJSONRequest('PUT', '/v1/passwords/token');
      expect(resp, 'to satisfy', {
        __httpCode: 404,
        err: 'Password reset token not found or has expired',
      });
    });
  });

  describe('Password reset sequence', () => {
    const email = 'luna@example.com';
    const newPassword = 'password1';
    let luna;
    let token;

    let capturedMail = null;
    let removeMailListener = () => null;

    before(async () => {
      await cleanDB($pg_database);
      luna = await createUserAsync('Luna', 'password');
      await updateUserAsync(luna, { email });

      removeMailListener = addMailListener((r) => (capturedMail = r));
    });
    after(removeMailListener);

    it('should send password reset link', async () => {
      const resp = await performJSONRequest('POST', '/v1/passwords', { email });
      expect(resp, 'to satisfy', { __httpCode: 200 });

      expect(capturedMail, 'to satisfy', { envelope: { to: [email] } });
      const parsedMail = await simpleParser(capturedMail.response);
      expect(parsedMail, 'to satisfy', { subject: config.mailer.resetPasswordMailSubject });

      const m = /\/reset\?token=(\S+)/.exec(parsedMail.text);
      expect(m, 'not to be null');

      [, token] = m;
    });

    it('should change password using token', async () => {
      const resp = await performJSONRequest('PUT', `/v1/passwords/${token}`, {
        newPassword,
        passwordConfirmation: newPassword,
      });
      expect(resp, 'to satisfy', { __httpCode: 200 });
    });

    it('should allow to log in with the new password', async () => {
      const resp = await performJSONRequest('POST', `/v1/session`, {
        username: luna.username,
        password: newPassword,
      });
      expect(resp, 'to satisfy', { __httpCode: 200 });
    });

    it('should not allow to use same token again', async () => {
      const resp = await performJSONRequest('PUT', `/v1/passwords/${token}`, {
        newPassword,
        passwordConfirmation: newPassword,
      });
      expect(resp, 'to satisfy', { __httpCode: 404 });
    });

    it('should not allow to use expired token', async () => {
      const resp = await performJSONRequest('POST', '/v1/passwords', { email });
      expect(resp, 'to satisfy', { __httpCode: 200 });

      const age = parseInt(
        await dbAdapter.database.getOne(
          'select extract(epoch from reset_password_expires_at - reset_password_sent_at) from users where uid = ?',
          luna.user.id,
        ),
      );

      expect(age, 'to be', config.passwordReset.tokenTTL);

      await dbAdapter.database.raw(
        `update users set reset_password_expires_at = now() - interval '1 second' where uid = ?`,
        luna.user.id,
      );

      const resp1 = await performJSONRequest('PUT', `/v1/passwords/${token}`, {
        newPassword,
        passwordConfirmation: newPassword,
      });
      expect(resp1, 'to satisfy', { __httpCode: 404 });
    });
  });
});
