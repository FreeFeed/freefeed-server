/* eslint-env node, mocha */
/* global $database, $pg_database */
import expect from 'unexpected';

import { getSingleton } from '../../app/app';
import { PubSub } from '../../app/models';
import { eventNames, PubSubAdapter } from '../../app/support/PubSubAdapter';
import cleanDB from '../dbCleaner';

import {
  authHeaders,
  createGroupAsync,
  createTestUsers,
  performJSONRequest,
  promoteToAdmin,
  subscribeToAsync,
} from './functional_test_helper';
import Session from './realtime-session';

describe('Group Blocks', () => {
  beforeEach(() => cleanDB($pg_database));

  let luna, mars, venus, jupiter, selenites, celestials;

  beforeEach(async () => {
    [luna, mars, venus, jupiter] = await createTestUsers(['luna', 'mars', ' venus', 'jupiter']);
    [selenites, celestials] = await Promise.all([
      createGroupAsync(luna, 'selenites'),
      createGroupAsync(luna, 'celestials'),
    ]);
    await Promise.all([promoteToAdmin(selenites, luna, venus), subscribeToAsync(mars, selenites)]);
  });

  it(`should block Mars in Selenites`, async () => {
    {
      const resp = await blockUserInGroup(mars, selenites, luna);
      expect(resp, 'to satisfy', { __httpCode: 200, blockedUsers: [mars.user.id] });
    }

    {
      const resp = await getBlockedUsers(selenites, luna);
      expect(resp, 'to satisfy', { __httpCode: 200, blockedUsers: [mars.user.id] });
    }
  });

  it(`should not block Venus (as admin) in Selenites`, async () => {
    const resp = await blockUserInGroup(venus, selenites, luna);
    expect(resp, 'to satisfy', { __httpCode: 403 });
  });

  it(`should not block Celestials (as group) in Selenites`, async () => {
    const resp = await blockUserInGroup(celestials, selenites, luna);
    expect(resp, 'to satisfy', { __httpCode: 403 });
  });

  it(`should not allow Mars (as non-admin) to block anyone in Selenites`, async () => {
    const resp = await blockUserInGroup(jupiter, selenites, mars);
    expect(resp, 'to satisfy', { __httpCode: 403 });
  });

  describe('Realtime events', () => {
    let jupiterSession;
    beforeEach(async () => {
      const app = await getSingleton();
      const port = process.env.PEPYATKA_SERVER_PORT || app.context.config.port;
      const pubsubAdapter = new PubSubAdapter($database);
      PubSub.setPublisher(pubsubAdapter);

      jupiterSession = await Session.create(port, 'Jupiter session');
      await jupiterSession.sendAsync('auth', { authToken: jupiter.authToken });
      await jupiterSession.sendAsync('subscribe', { global: ['users'] });
    });

    after(() => jupiterSession.disconnect());

    it(`should emit a 'global:user:update' event for Selenites when some user is blocked in it`, async () => {
      const test = jupiterSession.receiveWhile(eventNames.GLOBAL_USER_UPDATED, () =>
        blockUserInGroup(mars, selenites, luna),
      );
      await expect(test, 'when fulfilled', 'to satisfy', {
        user: { id: selenites.group.id },
      });
    });

    it(`should emit a 'global:user:update' event for Selenites when some user is unblocked in it`, async () => {
      await blockUserInGroup(mars, selenites, luna);
      const test = jupiterSession.receiveWhile(eventNames.GLOBAL_USER_UPDATED, () =>
        unblockUserInGroup(mars, selenites, luna),
      );
      await expect(test, 'when fulfilled', 'to satisfy', {
        user: { id: selenites.group.id },
      });
    });
  });

  describe('Mars is blocked in Selenites', () => {
    beforeEach(() => blockUserInGroup(mars, selenites, luna));

    it(`should allow Luna to unblock Mars`, async () => {
      const resp = await unblockUserInGroup(mars, selenites, luna);
      expect(resp, 'to satisfy', { __httpCode: 200, blockedUsers: [] });
    });

    it(`should not allow Jupiter (as non-admin) to unblock Mars`, async () => {
      const resp = await unblockUserInGroup(mars, selenites, jupiter);
      expect(resp, 'to satisfy', { __httpCode: 403 });
    });

    it(`should not allow Mars to create post in Selenites`, async () => {
      const resp = await performJSONRequest(
        'POST',
        '/v1/posts',
        {
          post: { body: 'Hello' },
          meta: { feeds: [selenites.username] },
        },
        authHeaders(mars),
      );
      expect(resp, 'to satisfy', { __httpCode: 403 });
    });
  });
});

// Helpers

function blockUserInGroup(user, group, admin) {
  return performJSONRequest(
    'POST',
    `/v2/groups/${group.username}/block/${user.username}`,
    {},
    authHeaders(admin),
  );
}

function unblockUserInGroup(user, group, admin) {
  return performJSONRequest(
    'POST',
    `/v2/groups/${group.username}/unblock/${user.username}`,
    {},
    authHeaders(admin),
  );
}

function getBlockedUsers(group, admin) {
  return performJSONRequest(
    'GET',
    `/v2/groups/${group.username}/blockedUsers`,
    {},
    authHeaders(admin),
  );
}
