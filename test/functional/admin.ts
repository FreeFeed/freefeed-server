import { before, describe, it } from 'mocha';
import expect from 'unexpected';

import { dbAdapter } from '../../app/models';
import cleanDB from '../dbCleaner';
import { ROLE_ADMIN, ROLE_MODERATOR } from '../../app/models/admins';

import {
  type UserCtx,
  createTestUsers,
  performJSONRequest,
  authHeaders,
  cmpBy,
} from './functional_test_helper';

describe('Admin API', () => {
  let luna: UserCtx;
  let mars: UserCtx;
  let venus: UserCtx;
  before(async () => {
    await cleanDB(dbAdapter.database);
    [luna, mars, venus] = await createTestUsers(['luna', 'mars', 'venus']);
    await Promise.all([
      dbAdapter.setUserAdminRole(luna.user.id, ROLE_ADMIN, true, {
        YES_I_WANT_TO_SET_ADMIN_FOR_TEST_ONLY: true,
      }),
      dbAdapter.setUserAdminRole(mars.user.id, ROLE_MODERATOR, true),
    ]);
  });

  describe('Who am I?', () => {
    it(`should require authorization for admin's whoami`, async () => {
      const response = await performJSONRequest('GET', `/api/admin/whoami`);
      await expect(response, 'to satisfy', { __httpCode: 401 });
    });

    it(`should not let non-admins to see admin's whoami`, async () => {
      const response = await performJSONRequest(
        'GET',
        `/api/admin/whoami`,
        null,
        authHeaders(venus),
      );
      await expect(response, 'to satisfy', { __httpCode: 403 });
    });

    it(`should let moderators to see admin's whoami`, async () => {
      const response = await performJSONRequest(
        'GET',
        `/api/admin/whoami`,
        null,
        authHeaders(mars),
      );
      await expect(response, 'to satisfy', {
        __httpCode: 200,
        user: { id: mars.user.id, roles: [ROLE_MODERATOR] },
      });
    });

    it(`should let true admins to see admin's whoami`, async () => {
      const response = await performJSONRequest(
        'GET',
        `/api/admin/whoami`,
        null,
        authHeaders(luna),
      );
      await expect(response, 'to satisfy', {
        __httpCode: 200,
        user: { id: luna.user.id, roles: [ROLE_ADMIN] },
      });
    });
  });

  describe('Add/remove/list moderators', () => {
    it(`should not let anonymous users to see members list`, async () => {
      const response = await performJSONRequest('GET', `/api/admin/members`);
      await expect(response, 'to satisfy', { __httpCode: 401 });
    });

    it(`should not let regular users to see members list`, async () => {
      const response = await performJSONRequest(
        'GET',
        `/api/admin/members`,
        null,
        authHeaders(venus),
      );
      await expect(response, 'to satisfy', { __httpCode: 403 });
    });

    it(`should not let moderators to see members list`, async () => {
      const response = await performJSONRequest(
        'GET',
        `/api/admin/members`,
        null,
        authHeaders(mars),
      );
      await expect(response, 'to satisfy', { __httpCode: 403 });
    });

    it(`should let admins to see members list of Mars and Luna`, async () => {
      const response = await performJSONRequest(
        'GET',
        `/api/admin/members`,
        null,
        authHeaders(luna),
      );
      await expect(response, 'to satisfy', {
        __httpCode: 200,
        users: expect.it(
          'when sorted by',
          cmpBy('id'),
          'to satisfy',
          [
            { id: luna.user.id, roles: [ROLE_ADMIN] },
            { id: mars.user.id, roles: [ROLE_MODERATOR] },
          ].sort(cmpBy('id')),
        ),
      });
    });

    it('should demote Mars from moderators', async () => {
      const response = await performJSONRequest(
        'POST',
        `/api/admin/members/${mars.username}/demote`,
        null,
        authHeaders(luna),
      );
      await expect(response, 'to satisfy', { __httpCode: 200, user: { roles: [] } });
    });

    it(`should return members list without Mars`, async () => {
      const response = await performJSONRequest(
        'GET',
        `/api/admin/members`,
        null,
        authHeaders(luna),
      );
      await expect(response, 'to satisfy', {
        __httpCode: 200,
        users: [{ id: luna.user.id, roles: [ROLE_ADMIN] }],
      });
    });

    it('should make Mars moderator again', async () => {
      const response = await performJSONRequest(
        'POST',
        `/api/admin/members/${mars.username}/promote`,
        null,
        authHeaders(luna),
      );
      await expect(response, 'to satisfy', { __httpCode: 200, user: { roles: [ROLE_MODERATOR] } });
    });
  });
});
