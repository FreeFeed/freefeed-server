/* eslint-env node, mocha */
/* global $database, $pg_database */
import expect from 'unexpected';

import { eventNames, PubSubAdapter } from '../../app/support/PubSubAdapter';
import { getSingleton } from '../../app/app';
import cleanDB from '../dbCleaner';
import { PubSub } from '../../app/models';
import { EVENT_TYPES } from '../../app/support/EventTypes';

import {
  createTestUsers,
  createAndReturnPost,
  subscribeToAsync,
  unsubscribeFromAsync,
  banUser,
  unbanUser,
} from './functional_test_helper';
import Session from './realtime-session';

// WARNING: It is not a test for all possible notifications
describe('Realtime Notifications', () => {
  let port;

  before(async () => {
    const app = await getSingleton();
    port = process.env.PEPYATKA_SERVER_PORT || app.context.config.port;
    const pubsubAdapter = new PubSubAdapter($database);
    PubSub.setPublisher(pubsubAdapter);
    await cleanDB($pg_database);
  });

  let luna, mars, lunaSession, marsSession;
  before(async () => {
    [luna, mars] = await createTestUsers(['luna', 'mars']);
    [lunaSession, marsSession] = await Promise.all([
      Session.create(port, 'Luna session'),
      Session.create(port, 'Mars session'),
    ]);

    await Promise.all([
      lunaSession.sendAsync('auth', { authToken: luna.authToken }),
      marsSession.sendAsync('auth', { authToken: mars.authToken }),
    ]);

    await Promise.all([
      lunaSession.sendAsync('subscribe', { user: [luna.user.id] }),
      marsSession.sendAsync('subscribe', { user: [mars.user.id] }),
    ]);
  });

  it(`should send '${EVENT_TYPES.MENTION_IN_POST}' event to mars`, async () => {
    const test = marsSession.receiveWhile(eventNames.EVENT_CREATED, () =>
      createAndReturnPost(luna, 'Hello, @mars'),
    );
    await expect(test, 'to be fulfilled with', {
      Notifications: [{ event_type: EVENT_TYPES.MENTION_IN_POST }],
    });
  });

  it(`should send '${EVENT_TYPES.USER_SUBSCRIBED}' event to mars`, async () => {
    const test = marsSession.receiveWhile(eventNames.EVENT_CREATED, () =>
      subscribeToAsync(luna, mars),
    );
    await expect(test, 'to be fulfilled with', {
      Notifications: [{ event_type: EVENT_TYPES.USER_SUBSCRIBED }],
    });
  });

  it(`should NOT send '${EVENT_TYPES.USER_UNSUBSCRIBED}' event to mars`, async () => {
    const test = marsSession.notReceiveWhile(eventNames.EVENT_CREATED, () =>
      unsubscribeFromAsync(luna, mars),
    );
    await expect(test, 'to be fulfilled');
  });

  it(`should NOT send '${EVENT_TYPES.BANNED_BY}' event to mars`, async () => {
    const test = marsSession.notReceiveWhile(eventNames.EVENT_CREATED, () => banUser(luna, mars));
    await expect(test, 'to be fulfilled');
  });

  it(`should NOT send '${EVENT_TYPES.UNBANNED_BY}' event to mars`, async () => {
    const test = marsSession.notReceiveWhile(eventNames.EVENT_CREATED, () => unbanUser(luna, mars));
    await expect(test, 'to be fulfilled');
  });

  it(`should send '${EVENT_TYPES.USER_BANNED}' event to luna`, async () => {
    const test = lunaSession.receiveWhile(eventNames.EVENT_CREATED, () => banUser(luna, mars));
    await expect(test, 'to be fulfilled with', {
      Notifications: [{ event_type: EVENT_TYPES.USER_BANNED }],
    });
  });

  it(`should send '${EVENT_TYPES.USER_UNBANNED}' event to luna`, async () => {
    const test = lunaSession.receiveWhile(eventNames.EVENT_CREATED, () => unbanUser(luna, mars));
    await expect(test, 'to be fulfilled with', {
      Notifications: [{ event_type: EVENT_TYPES.USER_UNBANNED }],
    });
  });
});
