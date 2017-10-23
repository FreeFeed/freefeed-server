/* eslint-env node, mocha */
/* global $database, $pg_database */
import knexCleaner from 'knex-cleaner';
import expect from 'unexpected'

import { getSingleton } from '../../app/app';
import { dbAdapter, PubSub } from '../../app/models';
import { PubSubAdapter } from '../../app/support/PubSubAdapter'

import * as funcTestHelper from './functional_test_helper';
import Session from './realtime-session';

describe('Realtime #2', () => {
  let port;

  before(async () => {
    const app = await getSingleton();
    port = process.env.PEPYATKA_SERVER_PORT || app.context.config.port;
    const pubsubAdapter = new PubSubAdapter($database)
    PubSub.setPublisher(pubsubAdapter)
  });

  let luna, mars,
    lunaSession,
    marsSession,
    anonSession;

  beforeEach(async () => {
    await knexCleaner.clean($pg_database);

    [luna, mars] = await Promise.all([
      funcTestHelper.createUserAsync('luna', 'pw'),
      funcTestHelper.createUserAsync('mars', 'pw'),
    ]);

    [lunaSession, marsSession, anonSession] = await Promise.all([
      Session.create(port, 'Luna session'),
      Session.create(port, 'Mars session'),
      Session.create(port, 'Anon session'),
    ]);
    lunaSession.send('auth', { authToken: luna.authToken });
    marsSession.send('auth', { authToken: mars.authToken });
  });

  afterEach(() => [lunaSession, marsSession, anonSession].forEach((s) => s.disconnect()));

  describe('Luna wrote post, Mars likes it', () => {
    let post;
    beforeEach(async () => {
      post = await funcTestHelper.createAndReturnPost(luna, 'Luna post');
      await funcTestHelper.like(post.id, mars.authToken);
    });

    describe('Mars tried to subscribe to Luna\'s RiverOfNews', () => {
      beforeEach(async () => {
        const lunaRoNFeed = await dbAdapter.getUserNamedFeed(luna.user.id, 'RiverOfNews');
        marsSession.send('subscribe', { 'timeline': [lunaRoNFeed.id] });
      });

      it(`shold not deliver 'like:remove' event when Mars unlikes post`, async () => {
        const marsEvent = marsSession.notReceive('like:remove');
        await Promise.all([
          funcTestHelper.unlike(post.id, mars.authToken),
          marsEvent,
        ]);
        expect(marsEvent, 'to be fulfilled');
      });
    });
  });
});
