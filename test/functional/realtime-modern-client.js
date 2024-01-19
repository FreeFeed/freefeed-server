/* eslint-env node, mocha */
/* global $database, $pg_database */
import expect from 'unexpected';

import { getSingleton } from '../../app/app';
import { PubSub } from '../../app/models';
import { PubSubAdapter, eventNames } from '../../app/support/PubSubAdapter';
import cleanDB from '../dbCleaner';
import { API_VERSION_ACTUAL } from '../../app/api-versions';

import { createTestUser, createAndReturnPost, goPrivate } from './functional_test_helper';
import Session from './realtime-session';

describe('Basic realtime operations with the modern client', () => {
  let port;

  before(async () => {
    const app = await getSingleton();
    port = process.env.PEPYATKA_SERVER_PORT || app.context.config.port;
    const pubsubAdapter = new PubSubAdapter($database);
    PubSub.setPublisher(pubsubAdapter);
  });

  let luna, lunaSession, anonSession, lunaTimelineId;

  beforeEach(async () => {
    await cleanDB($pg_database);

    luna = await createTestUser('luna');

    [lunaSession, anonSession] = await Promise.all([
      Session.createModern(port, 'Luna session'),
      Session.createModern(port, 'Anon session'),
    ]);

    await lunaSession.sendAsync('auth', { authToken: luna.authToken });
    lunaTimelineId = (await luna.user.getPostsTimeline()).id;
  });

  it(`should return status to Luna`, async () => {
    const resp = await lunaSession.sendAsync('status', null);
    expect(resp, 'to equal', {
      success: true,
      userId: luna.user.id,
      apiVersion: API_VERSION_ACTUAL,
      rooms: {},
    });
  });

  it(`should return status to anonymous`, async () => {
    const resp = await anonSession.sendAsync('status', null);
    expect(resp, 'to equal', {
      success: true,
      userId: null,
      apiVersion: API_VERSION_ACTUAL,
      rooms: {},
    });
  });

  it(`should allow to subscribe to Luna timeline`, async () => {
    const resp = await lunaSession.sendAsync('subscribe', { timeline: [lunaTimelineId] });
    expect(resp, 'to equal', {
      success: true,
      rooms: { timeline: [lunaTimelineId] },
    });
  });

  it(`should allow to unsubscribe from Luna timeline`, async () => {
    await lunaSession.sendAsync('subscribe', { timeline: [lunaTimelineId] });
    const resp = await lunaSession.sendAsync('unsubscribe', { timeline: [lunaTimelineId] });
    expect(resp, 'to equal', {
      success: true,
      rooms: {},
    });
  });

  describe(`Luna and anonymous subscribed to Luna timeline`, () => {
    beforeEach(() =>
      Promise.all([
        lunaSession.sendAsync('subscribe', { timeline: [lunaTimelineId] }),
        anonSession.sendAsync('subscribe', { timeline: [lunaTimelineId] }),
      ]),
    );

    it(`should send '${eventNames.POST_CREATED}' to Luna`, async () => {
      const test = lunaSession.receiveWhile(eventNames.POST_CREATED, () =>
        createAndReturnPost(luna, 'Luna post'),
      );
      await expect(test, 'when fulfilled', 'to satisfy', { posts: { body: 'Luna post' } });
    });

    it(`should send '${eventNames.POST_CREATED}' to anonymous`, async () => {
      const test = anonSession.receiveWhile(eventNames.POST_CREATED, () =>
        createAndReturnPost(luna, 'Luna post'),
      );
      await expect(test, 'when fulfilled', 'to satisfy', { posts: { body: 'Luna post' } });
    });

    describe(`Luna goes private`, () => {
      beforeEach(() => goPrivate(luna));

      it(`should send '${eventNames.POST_CREATED}' to Luna`, async () => {
        const test = lunaSession.receiveWhile(eventNames.POST_CREATED, () =>
          createAndReturnPost(luna, 'Luna post'),
        );
        await expect(test, 'when fulfilled', 'to satisfy', { posts: { body: 'Luna post' } });
      });

      it(`should NOT send '${eventNames.POST_CREATED}' to anonymous`, async () => {
        const test = anonSession.notReceiveWhile(eventNames.POST_CREATED, () =>
          createAndReturnPost(luna, 'Luna post'),
        );
        await expect(test, 'to be fulfilled');
      });
    });
  });
});
