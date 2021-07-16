/* eslint-env node, mocha */
/* global $database, $pg_database */
import expect from 'unexpected';

import cleanDB from '../dbCleaner';
import { getSingleton } from '../../app/app';
import {
  dbAdapter,
  PubSub,
  HOMEFEED_MODE_FRIENDS_ONLY,
  HOMEFEED_MODE_CLASSIC,
  HOMEFEED_MODE_FRIENDS_ALL_ACTIVITY,
} from '../../app/models';
import { PubSubAdapter } from '../../app/support/PubSubAdapter';

import * as funcTestHelper from './functional_test_helper';
import * as schema from './schemaV2-helper';
import Session from './realtime-session';

describe('Realtime #2', () => {
  let port;

  before(async () => {
    const app = await getSingleton();
    port = process.env.PEPYATKA_SERVER_PORT || app.context.config.port;
    const pubsubAdapter = new PubSubAdapter($database);
    PubSub.setPublisher(pubsubAdapter);
  });

  let luna, mars, lunaSession, marsSession, anonSession;

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
      marsSession.sendAsync('auth', { authToken: mars.authToken }),
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
      beforeEach(async () => {
        await Promise.all([
          lunaSession.sendAsync('subscribe', { post: [post.id] }),
          marsSession.sendAsync('subscribe', { post: [post.id] }),
          anonSession.sendAsync('subscribe', { post: [post.id] }),
        ]);
      });

      it(`should deliver 'post:hide' event only to Luna when Luna hides post`, async () => {
        const lunaEvent = lunaSession.receive('post:hide');
        const marsEvent = marsSession.notReceive('post:hide');
        const anonEvent = anonSession.notReceive('post:hide');
        await Promise.all([
          funcTestHelper.hidePost(post.id, luna),
          lunaEvent,
          marsEvent,
          anonEvent,
        ]);
        expect(lunaEvent, 'to be fulfilled with', { meta: { postId: post.id } });
        expect(marsEvent, 'to be fulfilled');
        expect(anonEvent, 'to be fulfilled');
      });

      it(`should deliver 'post:save' event only to Luna when Luna saves post`, async () => {
        const lunaEvent = lunaSession.receive('post:save');
        const marsEvent = marsSession.notReceive('post:save');
        const anonEvent = anonSession.notReceive('post:save');
        await Promise.all([
          funcTestHelper.savePost(post.id, luna),
          lunaEvent,
          marsEvent,
          anonEvent,
        ]);
        expect(lunaEvent, 'to be fulfilled with', { meta: { postId: post.id } });
        expect(marsEvent, 'to be fulfilled');
        expect(anonEvent, 'to be fulfilled');
      });

      describe('Lunа hide post', () => {
        beforeEach(async () => {
          await funcTestHelper.hidePost(post.id, luna);
        });

        it(`should deliver 'post:unhide' event only to Luna when Luna unhides post`, async () => {
          const lunaEvent = lunaSession.receive('post:unhide');
          const marsEvent = marsSession.notReceive('post:unhide');
          const anonEvent = anonSession.notReceive('post:unhide');
          await Promise.all([
            funcTestHelper.unhidePost(post.id, luna),
            lunaEvent,
            marsEvent,
            anonEvent,
          ]);
          expect(lunaEvent, 'to be fulfilled with', { meta: { postId: post.id } });
          expect(marsEvent, 'to be fulfilled');
          expect(anonEvent, 'to be fulfilled');
        });

        it(`should deliver 'post:update' event with isHidden field only to Luna when Luna updates post`, async () => {
          const lunaEvent = lunaSession.receive('post:update');
          const marsEvent = marsSession.receive('post:update');
          const anonEvent = anonSession.receive('post:update');
          luna.post = post;
          await Promise.all([
            funcTestHelper.updatePostAsync(luna, { body: 'Updated post' }),
            lunaEvent,
            marsEvent,
            anonEvent,
          ]);
          expect(lunaEvent, 'to be fulfilled with value satisfying', { posts: { isHidden: true } });
          expect(marsEvent, 'to be fulfilled with value satisfying', {
            posts: expect.it('to not have key', 'isHidden'),
          });
          expect(anonEvent, 'to be fulfilled with value satisfying', {
            posts: expect.it('to not have key', 'isHidden'),
          });
        });
      });

      describe('Lunа save post', () => {
        beforeEach(async () => {
          await funcTestHelper.savePost(post.id, luna);
        });

        it(`should deliver 'post:unsave' event only to Luna when Luna unsaves post`, async () => {
          const lunaEvent = lunaSession.receive('post:unsave');
          const marsEvent = marsSession.notReceive('post:unsave');
          const anonEvent = anonSession.notReceive('post:unsave');
          await Promise.all([
            funcTestHelper.unsavePost(post.id, luna),
            lunaEvent,
            marsEvent,
            anonEvent,
          ]);
          expect(lunaEvent, 'to be fulfilled with', { meta: { postId: post.id } });
          expect(marsEvent, 'to be fulfilled');
          expect(anonEvent, 'to be fulfilled');
        });

        it(`should deliver 'post:update' event with isSaved field only to Luna when Luna updates post`, async () => {
          const lunaEvent = lunaSession.receive('post:update');
          const marsEvent = marsSession.receive('post:update');
          const anonEvent = anonSession.receive('post:update');
          luna.post = post;
          await Promise.all([
            funcTestHelper.updatePostAsync(luna, { body: 'Updated post' }),
            lunaEvent,
            marsEvent,
            anonEvent,
          ]);
          expect(lunaEvent, 'to be fulfilled with value satisfying', { posts: { isSaved: true } });
          expect(marsEvent, 'to be fulfilled with value satisfying', {
            posts: expect.it('to not have key', 'isSaved'),
          });
          expect(anonEvent, 'to be fulfilled with value satisfying', {
            posts: expect.it('to not have key', 'isSaved'),
          });
        });
      });
    });

    describe('Luna and Mars are subscribed to their MyDiscussions', () => {
      beforeEach(async () => {
        const [lunaMDFeed, marsMDFeed] = await Promise.all([
          dbAdapter.getUserNamedFeed(luna.user.id, 'MyDiscussions'),
          dbAdapter.getUserNamedFeed(mars.user.id, 'MyDiscussions'),
        ]);
        await Promise.all([
          lunaSession.sendAsync('subscribe', { timeline: [lunaMDFeed.id] }),
          marsSession.sendAsync('subscribe', { timeline: [marsMDFeed.id] }),
        ]);
      });

      it(`should deliver 'like:remove' event when Mars unlikes post`, async () => {
        const lunaEvent = lunaSession.receive('like:remove');
        const marsEvent = marsSession.receive('like:remove');
        await Promise.all([funcTestHelper.unlike(post.id, mars.authToken), lunaEvent, marsEvent]);
        expect(lunaEvent, 'to be fulfilled');
        expect(marsEvent, 'to be fulfilled');
      });

      it(`should deliver events with correct 'realtimeChannels' fields`, async () => {
        const lunaEvent = lunaSession.receive('like:remove');
        const marsEvent = marsSession.receive('like:remove');
        const [, lunaMsg, marsMsg] = await Promise.all([
          funcTestHelper.unlike(post.id, mars.authToken),
          lunaEvent,
          marsEvent,
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

      it(`should deliver 'post:destroy' when Luna deletes post`, async () => {
        const lunaEvent = lunaSession.receive('post:destroy');
        const marsEvent = marsSession.receive('post:destroy');
        await Promise.all([funcTestHelper.deletePostAsync(luna, post.id), lunaEvent, marsEvent]);
        expect(lunaEvent, 'to be fulfilled');
        expect(marsEvent, 'to be fulfilled');
      });
    });

    describe('Luna saved post and subscribed to their Saves', () => {
      beforeEach(async () => {
        await funcTestHelper.savePost(post.id, luna);
        const lunaSavesFeed = await dbAdapter.getUserNamedFeed(luna.user.id, 'Saves');
        await lunaSession.sendAsync('subscribe', { timeline: [lunaSavesFeed.id] });
      });

      it(`should deliver 'like:remove' event when Mars unlikes post`, async () => {
        const lunaEvent = lunaSession.receive('like:remove');
        await Promise.all([funcTestHelper.unlike(post.id, mars.authToken), lunaEvent]);
        expect(lunaEvent, 'to be fulfilled');
      });
    });

    it(`Mars should not be able to subscribe to Luna's RiverOfNews`, async () => {
      const lunaRoNFeed = await dbAdapter.getUserNamedFeed(luna.user.id, 'RiverOfNews');
      const promise = marsSession.sendAsync('subscribe', { timeline: [lunaRoNFeed.id] });

      await expect(promise, 'to be rejected');
    });

    describe("Luna subscribed to Luna's user channel", () => {
      beforeEach(() => lunaSession.sendAsync('subscribe', { user: [luna.user.id] }));

      it(`should deliver 'user:update' event when Luna reads notifications`, async () => {
        const lunaEvent = lunaSession.receive('user:update');
        await Promise.all([funcTestHelper.markAllNotificationsAsRead(luna), lunaEvent]);
        expect(lunaEvent, 'to be fulfilled');
      });
    });

    it(`Mars should not be able to subscribe to Luna's user channel`, async () => {
      const promise = marsSession.sendAsync('subscribe', { user: [luna.user.id] });

      await expect(promise, 'to be rejected');
    });
  });

  describe('Luna wrote post, Mars comments it', () => {
    let post, commentId;
    beforeEach(async () => {
      post = await funcTestHelper.createAndReturnPost(luna, 'Luna post');
      const resp = await funcTestHelper.createCommentAsync(mars, post.id, 'comment');
      ({
        comments: { id: commentId },
      } = await resp.json());
    });

    describe('Luna and Mars are subscribed to their MyDiscussions', () => {
      beforeEach(async () => {
        const [lunaMDFeed, marsMDFeed] = await Promise.all([
          dbAdapter.getUserNamedFeed(luna.user.id, 'MyDiscussions'),
          dbAdapter.getUserNamedFeed(mars.user.id, 'MyDiscussions'),
        ]);
        await Promise.all([
          lunaSession.sendAsync('subscribe', { timeline: [lunaMDFeed.id] }),
          marsSession.sendAsync('subscribe', { timeline: [marsMDFeed.id] }),
        ]);
      });

      it(`should deliver 'comment:destroy' event when Mars destroys comment`, async () => {
        const lunaEvent = lunaSession.receive('comment:destroy');
        const marsEvent = marsSession.receive('comment:destroy');
        await Promise.all([
          funcTestHelper.removeCommentAsync(mars, commentId),
          lunaEvent,
          marsEvent,
        ]);
        expect(lunaEvent, 'to be fulfilled');
        expect(marsEvent, 'to be fulfilled');
      });
    });
  });

  describe(`'global:users' realtime channel`, () => {
    beforeEach(() =>
      Promise.all([
        anonSession.sendAsync('subscribe', { global: ['users'] }),
        lunaSession.sendAsync('subscribe', { global: ['users'] }),
        marsSession.sendAsync('subscribe', { global: ['users'] }),
      ]),
    );

    describe(`Updates of user`, () => {
      it(`should deliver 'global:user:update' event when Luna changes screenName`, async () => {
        const screenName = 'Sailor Moon';
        const test = anonSession.receiveWhile('global:user:update', () =>
          funcTestHelper.updateUserAsync(luna, { screenName }),
        );
        await expect(test, 'when fulfilled', 'to satisfy', {
          user: {
            ...schema.userBasic,
            id: luna.user.id,
            screenName,
          },
        });
      });

      it(`should deliver 'global:user:update' event when Luna goes private`, async () => {
        const test = anonSession.receiveWhile('global:user:update', () =>
          funcTestHelper.goPrivate(luna),
        );
        await expect(test, 'when fulfilled', 'to satisfy', {
          user: {
            ...schema.userBasic,
            id: luna.user.id,
            isPrivate: '1',
          },
        });
      });

      it(`should deliver 'global:user:update' event when Luna updates profile picture`, async () => {
        const test = anonSession.receiveWhile('global:user:update', () =>
          funcTestHelper.updateProfilePicture(luna, 'test/fixtures/default-userpic-75.gif'),
        );
        await expect(test, 'when fulfilled', 'to satisfy', {
          user: {
            ...schema.userBasic,
            id: luna.user.id,
            profilePictureLargeUrl: expect.it('not to be empty'),
            profilePictureMediumUrl: expect.it('not to be empty'),
          },
        });
      });

      it(`should deliver 'global:user:update' event when Luna updates username`, async () => {
        const lunaUser = await dbAdapter.getUserById(luna.user.id);
        const test = anonSession.receiveWhile('global:user:update', () =>
          lunaUser.updateUsername('jupiter'),
        );
        await expect(test, 'when fulfilled', 'to satisfy', {
          user: {
            id: luna.user.id,
            username: 'jupiter',
          },
        });
      });
    });

    describe(`Updates of group`, () => {
      let selenites, venus, venusSession;
      beforeEach(async () => {
        ({ group: selenites } = await funcTestHelper.createGroupAsync(luna, 'selenites'));
        await funcTestHelper.subscribeToAsync(mars, selenites);

        venus = await funcTestHelper.createTestUser('venus');
        venusSession = await Session.create(port, 'Venus session');
        await venusSession.sendAsync('auth', { authToken: venus.authToken });
        await venusSession.sendAsync('subscribe', { global: ['users'] });
      });

      const shouldMatchActualInfo = async (action, session, userCtx = null, should = true) => {
        const event = await session[should ? 'receiveWhile' : 'notReceiveWhile'](
          'global:user:update',
          action,
        );

        if (!should) {
          return;
        }

        const infoResp = await funcTestHelper.performJSONRequest(
          'GET',
          `/v1/users/${selenites.username}`,
          null,
          funcTestHelper.authHeaders(userCtx),
        );
        expect(event, 'to satisfy', { user: infoResp.users });
      };

      const watchers = [
        { session: null, userCtx: null, isGroupMember: false, name: 'Anonymous' },
        { session: null, userCtx: null, isGroupMember: true, name: 'Luna' },
        { session: null, userCtx: null, isGroupMember: true, name: 'Mars' },
        { session: null, userCtx: null, isGroupMember: false, name: 'Venus' },
      ];

      beforeEach(() => {
        watchers[0].session = anonSession;
        watchers[1].session = lunaSession;
        watchers[1].userCtx = luna;
        watchers[2].session = marsSession;
        watchers[2].userCtx = mars;
        watchers[3].session = venusSession;
        watchers[3].userCtx = venus;
      });

      for (const watcher of watchers) {
        describe(`${watcher.name} is watching`, () => {
          it(`should deliver 'global:user:update' event when group changes screenName`, () =>
            shouldMatchActualInfo(
              () =>
                funcTestHelper.updateGroupAsync(selenites, luna, {
                  screenName: 'The First Men in the Moon',
                }),
              watcher.session,
              watcher.userCtx,
            ));

          it(`should deliver 'global:user:update' event when group becomes restricted`, () =>
            shouldMatchActualInfo(
              () => funcTestHelper.updateGroupAsync(selenites, luna, { isRestricted: '1' }),
              watcher.session,
              watcher.userCtx,
            ));

          it(`should ${
            watcher.isGroupMember ? '' : 'not '
          }deliver 'global:user:update' event when group becomes private`, () =>
            shouldMatchActualInfo(
              () => funcTestHelper.updateGroupAsync(selenites, luna, { isPrivate: '1' }),
              watcher.session,
              watcher.userCtx,
              // Only for group members
              watcher.isGroupMember,
            ));

          it(`should deliver 'global:user:update' event when group updates profile picture`, () =>
            shouldMatchActualInfo(
              () =>
                funcTestHelper.updateGroupProfilePicture(
                  luna,
                  selenites.username,
                  'test/fixtures/default-userpic-75.gif',
                ),
              watcher.session,
              watcher.userCtx,
            ));
        });
      }
    });
  });

  describe('Luna and Mars are friends, both are listen to their homefeeds', () => {
    beforeEach(async () => {
      const [, lunaHomefeed, marsHomefeed] = await Promise.all([
        funcTestHelper.mutualSubscriptions([luna, mars]),
        dbAdapter.getUserNamedFeed(luna.user.id, 'RiverOfNews'),
        dbAdapter.getUserNamedFeed(mars.user.id, 'RiverOfNews'),
      ]);
      await Promise.all([
        lunaSession.sendAsync('subscribe', { timeline: [lunaHomefeed.id] }),
        marsSession.sendAsync('subscribe', { timeline: [marsHomefeed.id] }),
      ]);
    });

    it(`should deliver 'post:new' to Luna when Luna writes direct post to Mars`, async () => {
      const test = lunaSession.receiveWhile('post:new', () =>
        funcTestHelper.createAndReturnPostToFeed([mars.user], luna, 'Hello'),
      );
      await expect(test, 'to be fulfilled with', { realtimeChannels: expect.it('to be an array') });
    });

    it(`should deliver 'post:new' to Mars when Luna writes direct post to Mars`, async () => {
      const test = marsSession.receiveWhile('post:new', () =>
        funcTestHelper.createAndReturnPostToFeed([mars.user], luna, 'Hello'),
      );
      await expect(test, 'to be fulfilled');
    });

    describe('Luna wrote direct post to Mars', () => {
      let post;
      beforeEach(async () => {
        post = await funcTestHelper.createAndReturnPostToFeed([mars.user], luna, 'Hello');
      });

      it(`should deliver 'comment:new' to Luna when Luna comments direct post`, async () => {
        const test = lunaSession.receiveWhile('comment:new', () =>
          funcTestHelper.createCommentAsync(luna, post.id, 'Hello'),
        );
        await expect(test, 'to be fulfilled');
      });

      it(`should deliver 'comment:new' to Mars when Luna comments direct post`, async () => {
        const test = marsSession.receiveWhile('comment:new', () =>
          funcTestHelper.createCommentAsync(luna, post.id, 'Hello'),
        );
        await expect(test, 'to be fulfilled');
      });

      it(`should deliver 'post:destroy' to Luna when Luna deletes direct post`, async () => {
        const test = lunaSession.receiveWhile('post:destroy', () =>
          funcTestHelper.deletePostAsync(luna, post.id),
        );
        await expect(test, 'to be fulfilled');
      });

      it(`should deliver 'post:destroy' to Mars when Luna deletes direct post`, async () => {
        const test = marsSession.receiveWhile('post:destroy', () =>
          funcTestHelper.deletePostAsync(luna, post.id),
        );
        await expect(test, 'to be fulfilled');
      });
    });
  });

  describe(`Subscribe/unsubscribe acknowledgements`, () => {
    describe(`Luna subscribes to post 1`, () => {
      it('should have post 1 in response', async () => {
        const ack = await lunaSession.sendAsync('subscribe', { post: ['1'] });
        expect(ack, 'to equal', { success: true, rooms: { post: ['1'] } });
      });
    });

    describe(`Luna subscribes to posts 1 and 2 in the same request`, () => {
      it('should have post 1 and 2 in response', async () => {
        const ack = await lunaSession.sendAsync('subscribe', { post: ['1', '2'] });
        expect(ack, 'to equal', { success: true, rooms: { post: ['1', '2'] } });
      });
    });

    describe(`Luna subscribes to posts 1 and 2 in two requests`, () => {
      it('should have post 1 and 2 in response', async () => {
        await lunaSession.sendAsync('subscribe', { post: ['1'] });
        const ack = await lunaSession.sendAsync('subscribe', { post: ['2'] });
        expect(ack, 'to equal', { success: true, rooms: { post: ['1', '2'] } });
      });
    });

    describe(`Luna subscribes to posts 1, 2 and 3 and unsubsribes from post 2`, () => {
      it('should have post 1 and 3 in response', async () => {
        await lunaSession.sendAsync('subscribe', { post: ['1', '2', '3'] });
        const ack = await lunaSession.sendAsync('unsubscribe', { post: ['2'] });
        expect(ack, 'to equal', { success: true, rooms: { post: ['1', '3'] } });
      });
    });
  });

  describe('Change post destinations', () => {
    let jupiter, jupiterSession;

    beforeEach(async () => {
      jupiter = await funcTestHelper.createUserAsync('jupiter', 'pw');

      jupiterSession = await Session.create(port, 'Jupiter session');
      await jupiterSession.sendAsync('auth', { authToken: jupiter.authToken });
    });

    describe('Mars and Jupiter are subscribed to their homefeeds', () => {
      beforeEach(async () => {
        const [marsHomefeed, jupiterHomefeed] = await Promise.all([
          dbAdapter.getUserNamedFeed(mars.user.id, 'RiverOfNews'),
          dbAdapter.getUserNamedFeed(jupiter.user.id, 'RiverOfNews'),
        ]);
        await Promise.all([
          marsSession.sendAsync('subscribe', { timeline: [marsHomefeed.id] }),
          jupiterSession.sendAsync('subscribe', { timeline: [jupiterHomefeed.id] }),
        ]);
      });

      afterEach(() => [lunaSession, marsSession, anonSession].forEach((s) => s.disconnect()));

      describe('Luna have a private account, Mars subscribed to group, Anon listening to group', () => {
        let celestials;
        beforeEach(async () => {
          [celestials] = await Promise.all([
            funcTestHelper.createGroupAsync(luna, 'celestials'),
            funcTestHelper.goPrivate(luna),
          ]);
          const [celestialFeed] = await Promise.all([
            dbAdapter.getUserNamedFeed(celestials.group.id, 'Posts'),
            funcTestHelper.subscribeToAsync(mars, celestials),
          ]);
          await anonSession.sendAsync('subscribe', { timeline: [celestialFeed.id] });
        });

        it(`should send 'post:new' event to Mars when post becomes public`, async () => {
          luna.post = await funcTestHelper.createAndReturnPostToFeed([luna], luna, 'Post');
          const test = marsSession.receiveWhile('post:new', () =>
            funcTestHelper.updatePostAsync(luna, { feeds: [luna.username, celestials.username] }),
          );
          await expect(test, 'to be fulfilled');
        });

        it(`should send 'post:new' event to Anon when post becomes public`, async () => {
          luna.post = await funcTestHelper.createAndReturnPostToFeed([luna], luna, 'Post');
          const test = anonSession.receiveWhile('post:new', () =>
            funcTestHelper.updatePostAsync(luna, { feeds: [luna.username, celestials.username] }),
          );
          await expect(test, 'to be fulfilled');
        });

        it(`should send 'post:destroy' event to Mars when post becomes private`, async () => {
          luna.post = await funcTestHelper.createAndReturnPostToFeed(
            [luna, celestials],
            luna,
            'Post',
          );
          const test = marsSession.receiveWhile('post:destroy', () =>
            funcTestHelper.updatePostAsync(luna, { feeds: [luna.username] }),
          );
          await expect(test, 'to be fulfilled');
        });

        it(`should send 'post:destroy' event to Anon when post becomes private`, async () => {
          luna.post = await funcTestHelper.createAndReturnPostToFeed(
            [luna, celestials],
            luna,
            'Post',
          );
          const test = anonSession.receiveWhile('post:destroy', () =>
            funcTestHelper.updatePostAsync(luna, { feeds: [luna.username] }),
          );
          await expect(test, 'to be fulfilled');
        });

        describe(`Mars have a session #2 subscribed to Mars feed, both sessions are subscribed to 'foo:bar'`, () => {
          let secondMarsSession;

          beforeEach(async () => {
            secondMarsSession = await Session.create(port, 'Mars session');
            await secondMarsSession.sendAsync('auth', { authToken: mars.authToken });
            await Promise.all([
              secondMarsSession.sendAsync('subscribe', { foo: ['bar'] }),
              marsSession.sendAsync('subscribe', { foo: ['bar'] }),
            ]);
          });

          afterEach(() => secondMarsSession.disconnect());

          it(`should not leak 'post:new' event to session #2 when post becomes public`, async () => {
            luna.post = await funcTestHelper.createAndReturnPostToFeed([luna], luna, 'Post');
            const test = secondMarsSession.notReceiveWhile('post:new', () =>
              funcTestHelper.updatePostAsync(luna, { feeds: [luna.username, celestials.username] }),
            );
            await expect(test, 'to be fulfilled');
          });
        });
      });

      describe('Luna, Mars and Jupiter are friends', () => {
        beforeEach(async () => {
          await funcTestHelper.mutualSubscriptions([luna, mars, jupiter]);
        });

        it(`should send 'post:new' event to Jupiter when he becomes a direct recipient`, async () => {
          luna.post = await funcTestHelper.createAndReturnPostToFeed([mars], luna, 'Direct');
          const test = jupiterSession.receiveWhile('post:new', () =>
            funcTestHelper.updatePostAsync(luna, { feeds: [mars.username, jupiter.username] }),
          );
          await expect(test, 'to be fulfilled');
        });
      });
    });
  });
});

describe('Realtime: Homefeed modes', () => {
  let port;
  let luna, mars, venus;
  let selenites, celestials;
  let luna2lunaPost,
    mars2marsPost,
    venus2venusPost,
    mars2selenitesPost,
    mars2celestialsPost,
    venus2selenitesPost,
    venus2celestialsPost;
  let lunaHomefeed;
  let lunaSession;

  before(async () => {
    await cleanDB($pg_database);

    const app = await getSingleton();
    port = process.env.PEPYATKA_SERVER_PORT || app.context.config.port;
    const pubsubAdapter = new PubSubAdapter($database);
    PubSub.setPublisher(pubsubAdapter);

    [luna, mars, venus] = await Promise.all([
      funcTestHelper.createUserAsync('luna', 'pw'),
      funcTestHelper.createUserAsync('mars', 'pw'),
      funcTestHelper.createUserAsync('venus', 'pw'),
    ]);

    [selenites, celestials] = await Promise.all([
      funcTestHelper.createGroupAsync(venus, 'selenites'),
      funcTestHelper.createGroupAsync(venus, 'celestials'),
    ]);

    await Promise.all([
      funcTestHelper.subscribeToAsync(luna, mars), // Luna subscribed to Mars
      funcTestHelper.subscribeToAsync(luna, selenites), // Luna is a member of Selenites
      funcTestHelper.subscribeToAsync(mars, selenites), // Mars is a member of Selenites
      funcTestHelper.subscribeToAsync(mars, celestials), // Mars is a member of Celestials
    ]);

    [
      luna2lunaPost,
      mars2marsPost,
      venus2venusPost,
      mars2selenitesPost,
      mars2celestialsPost,
      venus2selenitesPost,
      venus2celestialsPost,
    ] = await Promise.all([
      funcTestHelper.createAndReturnPostToFeed(luna, luna, 'Post'),
      funcTestHelper.createAndReturnPostToFeed(mars, mars, 'Post'),
      funcTestHelper.createAndReturnPostToFeed(venus, venus, 'Post'),
      funcTestHelper.createAndReturnPostToFeed(selenites, mars, 'Post'),
      funcTestHelper.createAndReturnPostToFeed(celestials, mars, 'Post'),
      funcTestHelper.createAndReturnPostToFeed(selenites, venus, 'Post'),
      funcTestHelper.createAndReturnPostToFeed(celestials, venus, 'Post'),
    ]);

    lunaHomefeed = await dbAdapter.getUserNamedFeed(luna.user.id, 'RiverOfNews');

    lunaSession = await Session.create(port, 'Luna session');
    await lunaSession.sendAsync('auth', { authToken: luna.authToken });
  });

  const testPostActivity = async (commenter, post, should = true) => {
    const test = lunaSession[should ? 'receiveWhile' : 'notReceiveWhile']('comment:new', () =>
      funcTestHelper.createCommentAsync(commenter, post.id, 'Hello'),
    );
    await expect(test, 'to be fulfilled');
  };

  describe(`'${HOMEFEED_MODE_FRIENDS_ONLY}' mode`, () => {
    let rooms;
    before(async () => {
      ({ rooms } = await lunaSession.sendAsync('subscribe', {
        timeline: [`${lunaHomefeed.id}?homefeed-mode=${HOMEFEED_MODE_FRIENDS_ONLY}`],
      }));
    });
    after(() => lunaSession.sendAsync('unsubscribe', rooms));

    it(`should receive events from own post`, () => testPostActivity(venus, luna2lunaPost));

    it(`should receive events from friend's post`, () => testPostActivity(venus, mars2marsPost));

    it(`should receive events from friend's post in friendly group`, () =>
      testPostActivity(venus, mars2selenitesPost));

    it(`should receive events from non-friend's post in friendly group`, () =>
      testPostActivity(venus, venus2selenitesPost));

    it(`should not receive events about own comment to non-friend's post`, () =>
      testPostActivity(mars, venus2venusPost, false));

    it(`should not receive events about friend's comment to non-friend's post`, () =>
      testPostActivity(mars, venus2venusPost, false));

    it(`should not receive events about friend's comment to non-friendly group`, () =>
      testPostActivity(mars, venus2celestialsPost, false));

    it(`should not receive events about friend's post to non-friendly group`, () =>
      testPostActivity(venus, mars2celestialsPost, false));
  });

  describe(`'${HOMEFEED_MODE_CLASSIC}' mode`, () => {
    let rooms;
    before(async () => {
      ({ rooms } = await lunaSession.sendAsync('subscribe', {
        timeline: [`${lunaHomefeed.id}?homefeed-mode=${HOMEFEED_MODE_CLASSIC}`],
      }));
    });
    after(() => lunaSession.sendAsync('unsubscribe', rooms));

    it(`should receive events from own post`, () => testPostActivity(venus, luna2lunaPost));

    it(`should receive events from friend's post`, () => testPostActivity(venus, mars2marsPost));

    it(`should receive events from friend's post in friendly group`, () =>
      testPostActivity(venus, mars2selenitesPost));

    it(`should receive events from non-friend's post in friendly group`, () =>
      testPostActivity(venus, venus2selenitesPost));

    it(`should receive events about own comment to non-friend's post`, () =>
      testPostActivity(mars, venus2venusPost));

    it(`should receive events about friend's comment to non-friend's post`, () =>
      testPostActivity(mars, venus2venusPost));

    it(`should not receive events about friend's comment to non-friendly group`, () =>
      testPostActivity(mars, venus2celestialsPost, false));

    it(`should not receive events about friend's post to non-friendly group`, () =>
      testPostActivity(venus, mars2celestialsPost, false));
  });

  describe(`omitted (i.e. '${HOMEFEED_MODE_CLASSIC}') mode`, () => {
    let rooms;
    before(async () => {
      ({ rooms } = await lunaSession.sendAsync('subscribe', { timeline: [lunaHomefeed.id] }));
    });
    after(() => lunaSession.sendAsync('unsubscribe', rooms));

    it(`should receive events from own post`, () => testPostActivity(venus, luna2lunaPost));

    it(`should receive events from friend's post`, () => testPostActivity(venus, mars2marsPost));

    it(`should receive events from friend's post in friendly group`, () =>
      testPostActivity(venus, mars2selenitesPost));

    it(`should receive events from non-friend's post in friendly group`, () =>
      testPostActivity(venus, venus2selenitesPost));

    it(`should receive events about own comment to non-friend's post`, () =>
      testPostActivity(mars, venus2venusPost));

    it(`should receive events about friend's comment to non-friend's post`, () =>
      testPostActivity(mars, venus2venusPost));

    it(`should not receive events about friend's comment to non-friendly group`, () =>
      testPostActivity(mars, venus2celestialsPost, false));

    it(`should not receive events about friend's post to non-friendly group`, () =>
      testPostActivity(venus, mars2celestialsPost, false));
  });

  describe(`'${HOMEFEED_MODE_FRIENDS_ALL_ACTIVITY}' mode`, () => {
    let rooms;
    before(async () => {
      ({ rooms } = await lunaSession.sendAsync('subscribe', {
        timeline: [`${lunaHomefeed.id}?homefeed-mode=${HOMEFEED_MODE_FRIENDS_ALL_ACTIVITY}`],
      }));
    });
    after(() => lunaSession.sendAsync('unsubscribe', rooms));

    it(`should receive events from own post`, () => testPostActivity(venus, luna2lunaPost));

    it(`should receive events from friend's post`, () => testPostActivity(venus, mars2marsPost));

    it(`should receive events from friend's post in friendly group`, () =>
      testPostActivity(venus, mars2selenitesPost));

    it(`should receive events from non-friend's post in friendly group`, () =>
      testPostActivity(venus, venus2selenitesPost));

    it(`should receive events about own comment to non-friend's post`, () =>
      testPostActivity(mars, venus2venusPost));

    it(`should receive events about friend's comment to non-friend's post`, () =>
      testPostActivity(mars, venus2venusPost));

    it(`should receive events about friend's comment to non-friendly group`, () =>
      testPostActivity(mars, venus2celestialsPost));

    it(`should receive events about friend's post to non-friendly group`, () =>
      testPostActivity(venus, mars2celestialsPost));
  });
});

describe('Realtime: Group time updates', () => {
  let luna, mars, venus, jupiter, celestials, selenites;
  let lunaSession, marsSession, venusSession, jupiterSession;

  before(async () => {
    await cleanDB($pg_database);

    const app = await getSingleton();
    const port = process.env.PEPYATKA_SERVER_PORT || app.context.config.port;
    const pubsubAdapter = new PubSubAdapter($database);
    PubSub.setPublisher(pubsubAdapter);

    // luna, mars, venus, jupiter are users
    [luna, mars, venus, jupiter] = await funcTestHelper.createTestUsers([
      'luna',
      'mars',
      'venus',
      'jupiter',
    ]);
    // selenites, celestials are groups owned by luna and mars
    [selenites, celestials] = await Promise.all([
      funcTestHelper.createGroupAsync(luna, 'selenites'),
      funcTestHelper.createGroupAsync(mars, 'celestials'),
    ]);
    // luna and mars subscribed to both groups, venus isn't subscribed to any,
    // jupiter subscribed to selenites only
    await Promise.all([
      funcTestHelper.subscribeToAsync(mars, selenites),
      funcTestHelper.subscribeToAsync(luna, celestials),
      funcTestHelper.subscribeToAsync(jupiter, selenites),
    ]);

    // all users listening to their own 'user:' RT channel
    [lunaSession, marsSession, venusSession, jupiterSession] = await Promise.all(
      [luna, mars, venus, jupiter].map(async (ctx) => {
        const session = await Session.create(port, `${ctx.username} session`);
        await session.sendAsync('auth', { authToken: ctx.authToken });
        await session.sendAsync('subscribe', { user: [ctx.user.id] });
        return session;
      }),
    );
  });

  after(() =>
    Promise.all(
      [lunaSession, marsSession, venusSession, jupiterSession].map((s) => s.disconnect()),
    ),
  );

  it(`should deliver 'user:update' to Luna when Luna writes a post to Selenites`, async () => {
    const test = lunaSession.receiveWhile('user:update', () =>
      funcTestHelper.createAndReturnPostToFeed([selenites], luna, 'Hello'),
    );
    await expect(test, 'to be fulfilled with', { updatedGroups: [{ id: selenites.group.id }] });
  });

  it(`should deliver 'user:update' to Luna when Luna writes a comment to post in Selenites`, async () => {
    const post = await funcTestHelper.createAndReturnPostToFeed([selenites], luna, 'Hello');
    const test = lunaSession.receiveWhile('user:update', () =>
      funcTestHelper.createCommentAsync(luna, post.id, 'Hello'),
    );
    await expect(test, 'to be fulfilled with', { updatedGroups: [{ id: selenites.group.id }] });
  });

  it(`should deliver 'user:update' to Mars when Luna writes a post to Selenites`, async () => {
    const test = marsSession.receiveWhile('user:update', () =>
      funcTestHelper.createAndReturnPostToFeed([selenites], luna, 'Hello'),
    );
    await expect(test, 'to be fulfilled with', { updatedGroups: [{ id: selenites.group.id }] });
  });

  it(`should deliver 'user:update' with two groups to Luna when Luna writes a post to Selenites and Celestials`, async () => {
    const test = lunaSession.receiveWhile('user:update', () =>
      funcTestHelper.createAndReturnPostToFeed([selenites, celestials], luna, 'Hello'),
    );
    await expect(test, 'to be fulfilled with', {
      updatedGroups: expect
        .it('to have length', 2)
        .and('to have an item satisfying', { id: selenites.group.id })
        .and('to have an item satisfying', { id: celestials.group.id }),
    });
  });

  it(`should deliver 'user:update' with two groups to Mars when Luna writes a post to Selenites and Celestials`, async () => {
    const test = marsSession.receiveWhile('user:update', () =>
      funcTestHelper.createAndReturnPostToFeed([selenites, celestials], luna, 'Hello'),
    );
    await expect(test, 'to be fulfilled with', {
      updatedGroups: expect
        .it('to have length', 2)
        .and('to have an item satisfying', { id: selenites.group.id })
        .and('to have an item satisfying', { id: celestials.group.id }),
    });
  });

  it(`should not deliver 'user:update' to Venus when Luna writes a post to Selenites`, async () => {
    const test = venusSession.notReceiveWhile('user:update', () =>
      funcTestHelper.createAndReturnPostToFeed([selenites], luna, 'Hello'),
    );
    await expect(test, 'to be fulfilled');
  });

  it(`should deliver 'user:update' with Selenites only group to Jupiter when Luna writes a post to Selenites and Celestials`, async () => {
    const test = jupiterSession.receiveWhile('user:update', () =>
      funcTestHelper.createAndReturnPostToFeed([selenites, celestials], luna, 'Hello'),
    );
    await expect(test, 'to be fulfilled with', { updatedGroups: [{ id: selenites.group.id }] });
  });
});
