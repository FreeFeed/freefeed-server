/* eslint-env node, mocha */
/* global $database, $pg_database */
import expect from 'unexpected'

import cleanDB from '../dbCleaner';
import { getSingleton } from '../../app/app';
import { dbAdapter, PubSub } from '../../app/models';
import { PubSubAdapter } from '../../app/support/PubSubAdapter'

import * as funcTestHelper from './functional_test_helper';
import * as schema from './schemaV2-helper';
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
    await cleanDB($pg_database);

    [luna, mars] = await Promise.all([
      funcTestHelper.createUserAsync('luna', 'pw'),
      funcTestHelper.createUserAsync('mars', 'pw'),
    ]);

    [lunaSession, marsSession, anonSession] = await Promise.all([
      Session.create(port, 'Luna session'),
      Session.create(port, 'Mars session'),
      Session.create(port, 'Anon session'),
    ]);

    await Promise.all([
      lunaSession.sendAsync('auth', { authToken: luna.authToken }),
      marsSession.sendAsync('auth', { authToken: mars.authToken })
    ]);
  });

  afterEach(() => [lunaSession, marsSession, anonSession].forEach((s) => s.disconnect()));

  describe('Luna wrote post, Mars likes it', () => {
    let post;
    beforeEach(async () => {
      post = await funcTestHelper.createAndReturnPost(luna, 'Luna post');
      await funcTestHelper.like(post.id, mars.authToken);
    });

    describe('Luna, Mars and Anon are subscribed to the post channel', () => {
      beforeEach(() => {
        lunaSession.send('subscribe', { 'post': [post.id] });
        marsSession.send('subscribe', { 'post': [post.id] });
        anonSession.send('subscribe', { 'post': [post.id] });
      });

      it(`shold deliver 'post:hide' event only to Luna when Luna hides post`, async () => {
        const lunaEvent = lunaSession.receive('post:hide');
        const marsEvent = marsSession.notReceive('post:hide');
        const anonEvent = anonSession.notReceive('post:hide');
        await Promise.all([
          funcTestHelper.hidePost(post.id, luna),
          lunaEvent, marsEvent, anonEvent,
        ]);
        expect(lunaEvent, 'to be fulfilled with', { meta: { postId: post.id } });
        expect(marsEvent, 'to be fulfilled');
        expect(anonEvent, 'to be fulfilled');
      });

      describe('Lunа hide post', () => {
        beforeEach(async () => {
          await funcTestHelper.hidePost(post.id, luna);
        });

        it(`shold deliver 'post:unhide' event only to Luna when Luna unhides post`, async () => {
          const lunaEvent = lunaSession.receive('post:unhide');
          const marsEvent = marsSession.notReceive('post:unhide');
          const anonEvent = anonSession.notReceive('post:unhide');
          await Promise.all([
            funcTestHelper.unhidePost(post.id, luna),
            lunaEvent, marsEvent, anonEvent,
          ]);
          expect(lunaEvent, 'to be fulfilled with', { meta: { postId: post.id } });
          expect(marsEvent, 'to be fulfilled');
          expect(anonEvent, 'to be fulfilled');
        });

        it(`shold deliver 'post:update' event with isHidden field only to Luna when Luna updates post`, async () => {
          const lunaEvent = lunaSession.receive('post:update');
          const marsEvent = marsSession.receive('post:update');
          const anonEvent = anonSession.receive('post:update');
          luna.post = post;
          await Promise.all([
            funcTestHelper.updatePostAsync(luna, { body: 'Updated post' }),
            lunaEvent, marsEvent, anonEvent,
          ]);
          expect(lunaEvent, 'to be fulfilled with value satisfying', { posts: { isHidden: true } });
          expect(marsEvent, 'to be fulfilled with value satisfying', { posts: expect.it('to not have key', 'isHidden') });
          expect(anonEvent, 'to be fulfilled with value satisfying', { posts: expect.it('to not have key', 'isHidden') });
        });
      });
    });

    describe('Luna and Mars are subscribed to their MyDiscussions', () => {
      beforeEach(async () => {
        const [lunaMDFeed, marsMDFeed] = await Promise.all([
          dbAdapter.getUserNamedFeed(luna.user.id, 'MyDiscussions'),
          dbAdapter.getUserNamedFeed(mars.user.id, 'MyDiscussions'),
        ]);
        lunaSession.send('subscribe', { 'timeline': [lunaMDFeed.id] });
        marsSession.send('subscribe', { 'timeline': [marsMDFeed.id] });
      });

      it(`shold deliver 'like:remove' event when Mars unlikes post`, async () => {
        const lunaEvent = lunaSession.receive('like:remove');
        const marsEvent = marsSession.receive('like:remove');
        await Promise.all([
          funcTestHelper.unlike(post.id, mars.authToken),
          lunaEvent, marsEvent,
        ]);
        expect(lunaEvent, 'to be fulfilled');
        expect(marsEvent, 'to be fulfilled');
      });

      it(`shold deliver events with correct 'realtimeChannels' fields`, async () => {
        const lunaEvent = lunaSession.receive('like:remove');
        const marsEvent = marsSession.receive('like:remove');
        const [, lunaMsg, marsMsg] = await Promise.all([
          funcTestHelper.unlike(post.id, mars.authToken),
          lunaEvent, marsEvent,
        ]);
        expect(lunaEvent, 'to be fulfilled');
        expect(marsEvent, 'to be fulfilled');
        const [lunaMDFeed, marsMDFeed] = await Promise.all([
          dbAdapter.getUserNamedFeed(luna.user.id, 'MyDiscussions'),
          dbAdapter.getUserNamedFeed(mars.user.id, 'MyDiscussions'),
        ]);
        expect(lunaMsg, 'to satisfy', { realtimeChannels: [`timeline:${lunaMDFeed.id}`] });
        expect(marsMsg, 'to satisfy', { realtimeChannels: [`timeline:${marsMDFeed.id}`] });
      });

      it(`shold deliver 'post:destroy' when Luna deletes post`, async () => {
        const lunaEvent = lunaSession.receive('post:destroy');
        const marsEvent = marsSession.receive('post:destroy');
        await Promise.all([
          funcTestHelper.deletePostAsync(luna, post.id),
          lunaEvent, marsEvent,
        ]);
        expect(lunaEvent, 'to be fulfilled');
        expect(marsEvent, 'to be fulfilled');
      });
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

    describe('Luna subscribed to Luna\'s user channel', () => {
      beforeEach(() => lunaSession.send('subscribe', { 'user': [luna.user.id] }));

      it(`shold deliver 'user:update' event when Luna reads notifications`, async () => {
        const lunaEvent = lunaSession.receive('user:update');
        await Promise.all([
          funcTestHelper.markAllNotificationsAsRead(luna),
          lunaEvent,
        ]);
        expect(lunaEvent, 'to be fulfilled');
      });
    });

    describe('Mars tried to subscribe to Luna\'s user channel', () => {
      beforeEach(() => marsSession.send('subscribe', { 'user': [luna.user.id] }));

      it(`shold not deliver 'user:update' event when Luna reads notifications`, async () => {
        const marsEvent = marsSession.notReceive('user:update');
        await Promise.all([
          funcTestHelper.markAllNotificationsAsRead(luna),
          marsEvent,
        ]);
        expect(marsEvent, 'to be fulfilled');
      });
    });
  });

  describe(`'global:users' realtime channel`, () => {
    beforeEach(() => {
      anonSession.send('subscribe', { 'global': ['users'] });
    });

    describe(`Updates of user`, () => {
      it(`should deliver 'global:user:update' event when Luna changes screenName`, async () => {
        const screenName = 'Sailor Moon';
        const test = anonSession.receiveWhile(
          'global:user:update',
          funcTestHelper.updateUserAsync(luna, { screenName })
        );
        await expect(test, 'when fulfilled', 'to satisfy', {
          user: {
            ...schema.userBasic,
            id: luna.user.id,
            screenName,
          }
        });
      });

      it(`should deliver 'global:user:update' event when Luna goes private`, async () => {
        const test = anonSession.receiveWhile(
          'global:user:update',
          funcTestHelper.goPrivate(luna)
        );
        await expect(test, 'when fulfilled', 'to satisfy', {
          user: {
            ...schema.userBasic,
            id:        luna.user.id,
            isPrivate: '1',
          }
        });
      });

      it(`should deliver 'global:user:update' event when Luna updates profile picture`, async () => {
        const test = anonSession.receiveWhile(
          'global:user:update',
          funcTestHelper.updateProfilePicture(luna, 'test/fixtures/default-userpic-75.gif')
        );
        await expect(test, 'when fulfilled', 'to satisfy', {
          user: {
            ...schema.userBasic,
            id:                      luna.user.id,
            profilePictureLargeUrl:  expect.it('not to be empty'),
            profilePictureMediumUrl: expect.it('not to be empty'),
          }
        });
      });
    });

    describe(`Updates of group`, () => {
      let selenites;
      beforeEach(async () => {
        ({ group: selenites } = await funcTestHelper.createGroupAsync(luna, 'selenites'));
      });

      it(`should deliver 'global:user:update' event when group changes screenName`, async () => {
        const screenName = 'The First Men in the Moon';
        const test = anonSession.receiveWhile(
          'global:user:update',
          funcTestHelper.updateGroupAsync(selenites, luna, { screenName })
        );
        await expect(test, 'when fulfilled', 'to satisfy', {
          user: {
            ...schema.groupBasic,
            id: selenites.id,
            screenName,
          }
        });
      });

      it(`should deliver 'global:user:update' event when group becomes restricted`, async () => {
        const test = anonSession.receiveWhile(
          'global:user:update',
          funcTestHelper.updateGroupAsync(selenites, luna, { isRestricted: '1' })
        );
        await expect(test, 'when fulfilled', 'to satisfy', {
          user: {
            ...schema.groupBasic,
            id:           selenites.id,
            isRestricted: '1',
          }
        });
      });

      it(`should deliver 'global:user:update' event when group updates profile picture`, async () => {
        const test = anonSession.receiveWhile(
          'global:user:update',
          funcTestHelper.updateGroupProfilePicture(luna, selenites.username, 'test/fixtures/default-userpic-75.gif')
        );
        await expect(test, 'when fulfilled', 'to satisfy', {
          user: {
            ...schema.groupBasic,
            id:                      selenites.id,
            profilePictureLargeUrl:  expect.it('not to be empty'),
            profilePictureMediumUrl: expect.it('not to be empty'),
          }
        });
      });
    });
  });
});
