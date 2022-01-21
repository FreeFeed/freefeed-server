/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../dbCleaner';
import { getSingleton } from '../../app/app';
import { DummyPublisher } from '../../app/pubsub';
import { PubSub } from '../../app/models';

import { createUserAsync, performJSONRequest, updateUserAsync } from './functional_test_helper';

describe('PasswordsController', () => {
  before(async () => {
    await getSingleton();
    PubSub.setPublisher(new DummyPublisher());
  });

  beforeEach(() => cleanDB($pg_database));

  describe('#create()', () => {
    let luna;
    const oldEmail = 'test@example.com';

    beforeEach(async () => {
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
    let luna = {};
    const email = 'luna@example.com';

    beforeEach(async () => {
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
});
