/* eslint-env node, mocha */
/* global $pg_database */
import fetch from 'node-fetch'
import request from 'superagent'
import expect from 'unexpected'
import config from 'config';
import { sortBy, uniq } from 'lodash';

import cleanDB from '../dbCleaner';
import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub, Comment, dbAdapter, User } from '../../app/models'
import {
  createUserAsync,
  mutualSubscriptions,
  subscribeToAsync,
  createGroupAsync,
  sendRequestToJoinGroup,
  updateUserAsync,
  createTestUsers,
  getUserAsync,
  banUser,
  MockHTTPServer,
  createTestUser,
  performJSONRequest,
  createUserAsyncPost,
  authHeaders,
} from '../functional/functional_test_helper'
import { valiate as validateUserPrefs } from '../../app/models/user-prefs';

import * as schema from './schemaV2-helper';


describe('UsersControllerV2', () => {
  let app

  before(async () => {
    app = await getSingleton()
    PubSub.setPublisher(new DummyPublisher())
  })

  beforeEach(() => cleanDB($pg_database))

  describe('#blockedByMe()', () => {
    it('should reject unauthenticated users', (done) => {
      request
        .get(`${app.context.config.host}/v2/users/blockedByMe`)
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })

    it('should return list for authenticated user', async () => {
      const userA = {
        username: 'Luna',
        password: 'password'
      }

      const userB = {
        username: 'Mars',
        password: 'password'
      }


      const userAResponse = await createUserAsync(userA.username, userA.password)

      const userBResponse = await createUserAsync(userB.username, userB.password)

      await fetch(`${app.context.config.host}/v1/users/${userB.username}/ban`, {
        method:  'POST',
        headers: { 'X-Authentication-Token': userAResponse.authToken }
      })

      const blockedByMeResponse = await fetch(`${app.context.config.host}/v2/users/blockedbyme`, { headers: { 'X-Authentication-Token': userAResponse.authToken } })

      const blockedByMe = await blockedByMeResponse.json()

      blockedByMe.should.not.be.empty
      blockedByMe.length.should.eql(1)
      blockedByMe[0].should.have.property('id')
      blockedByMe[0].id.should.eql(userBResponse.user.id)
      blockedByMe[0].should.have.property('username')
      blockedByMe[0].username.should.eql(userB.username.toLowerCase())
      blockedByMe[0].should.have.property('screenName')
      blockedByMe[0].should.have.property('profilePictureLargeUrl')
      blockedByMe[0].should.have.property('profilePictureMediumUrl')
    })
  })

  describe('#whoami()', () => {
    it('should reject unauthenticated users', (done) => {
      request
        .get(`${app.context.config.host}/v2/users/whoami`)
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })

    it('should return proper structure for authenticated user', async () => {
      const [
        luna,
        mars,
        venus,
        zeus,
        pluto,
      ] = await Promise.all([
        createUserAsync('luna', 'pw'),
        createUserAsync('mars', 'pw'),
        createUserAsync('venus', 'pw'),
        createUserAsync('zeus', 'pw'),
        createUserAsync('pluto', 'pw'),
      ]);

      const [
        ,
        ,
        ,
        selenitesGroup,
      ] = await Promise.all([
        mutualSubscriptions([luna, mars]),
        subscribeToAsync(luna, venus),
        subscribeToAsync(zeus, luna),
        createGroupAsync(luna, 'selenites', 'Selenites', true, false),
      ]);

      await sendRequestToJoinGroup(mars, selenitesGroup);
      await sendRequestToJoinGroup(pluto, selenitesGroup); // request from non-friend

      const whoAmI = await fetch(`${app.context.config.host}/v2/users/whoami`, { headers: { 'X-Authentication-Token': luna.authToken } }).then((r) => r.json());

      const managedGroupSchema = {
        ...schema.group,
        requests: expect.it('to be an array').and('to be empty').or('to have items exhaustively satisfying', schema.user),
      };

      const thisUserSchema = {
        ...schema.user,
        email:                       expect.it('to be a string'),
        privateMeta:                 expect.it('to be an object'),
        frontendPreferences:         expect.it('to be an object'),
        banIds:                      expect.it('to be an array').and('to be empty').or('to have items satisfying', schema.UUID),
        pendingGroupRequests:        expect.it('to be a boolean'),
        pendingSubscriptionRequests: expect.it('to be an array').and('to be empty').or('to have items satisfying', schema.UUID),
        subscriptionRequests:        expect.it('to be an array').and('to be empty').or('to have items satisfying', schema.UUID),
        unreadDirectsNumber:         expect.it('to be a string').and('to match', /^\d+$/),
        unreadNotificationsNumber:   expect.it('to be a number'),
        subscribers:                 expect.it('to be an array').and('to be empty').or('to have items exhaustively satisfying', schema.user),
        subscriptions:               expect.it('to be an array').and('to be empty').or('to have items satisfying', schema.UUID),
        preferences:                 expect.it('to satisfy', (data) => expect(validateUserPrefs(data), 'to be an object')),
      };

      expect(whoAmI, 'to exhaustively satisfy', {
        users:         thisUserSchema,
        subscribers:   expect.it('to be an array').and('to be empty').or('to have items exhaustively satisfying', schema.userOrGroup),
        subscriptions: expect.it('to be an array').and('to be empty').or('to have items exhaustively satisfying', {
          id:   expect.it('to satisfy', schema.UUID),
          name: expect.it('to be a string'),
          user: expect.it('to be a string'),
        }),
        requests:      expect.it('to be an array').and('to be empty').or('to have items exhaustively satisfying', schema.userOrGroup),
        managedGroups: expect.it('to be an array').and('to be empty').or('to have items exhaustively satisfying', managedGroupSchema),
      });
    });

    describe('Subscribers', () => {
      let user;
      const readersCount = 5;
      let readers;

      beforeEach(async () => {
        [user, ...readers] = await createTestUsers(readersCount + 1);

        for (const reader of readers) {
          // Order is important
          await subscribeToAsync(reader, user); // eslint-disable-line no-await-in-loop
        }
      });

      it('should return subscribers ordered by subscription time (most recent first)', async () => {
        const { users: { subscribers } } = await fetch(
          `${app.context.config.host}/v2/users/whoami`,
          { headers: { 'X-Authentication-Token': user.authToken } }
        ).then((r) => r.json());
        const subscribersIds = subscribers.map((s) => s.id);
        const readersIds = readers.map((fr) => fr.user.id);
        readersIds.reverse();
        expect(subscribersIds, 'to equal', readersIds);
      });
    });

    describe('Subscriptions', () => {
      let user;
      const friendsCount = 5;
      let friends;

      beforeEach(async () => {
        [user, ...friends] = await createTestUsers(friendsCount + 1);

        for (const friend of friends) {
          // Order is important
          await subscribeToAsync(user, friend); // eslint-disable-line no-await-in-loop
        }
      });

      it('should return subscriptions ordered by subscription time (most recent first)', async () => {
        const { subscriptions:feeds } = await fetch(
          `${app.context.config.host}/v2/users/whoami`,
          { headers: { 'X-Authentication-Token': user.authToken } }
        ).then((r) => r.json());
        const feedOwnerIds = feeds.map((f) => f.user);
        const friendsIds = friends.map((fr) => fr.user.id);
        friendsIds.reverse();
        expect(feedOwnerIds, 'to equal', friendsIds);
      });
    });
  })

  describe('Backend preferences', () => {
    let luna;

    beforeEach(async () => {
      luna = await createUserAsync('luna', 'pw');
    });

    it('should allow to update preferences with valid value', async () => {
      const preferences = { hideCommentsOfTypes: [Comment.HIDDEN_BANNED] };
      const res = await updateUserAsync(luna, { preferences });
      const data = await res.json();
      expect(data, 'to satisfy', { users: { preferences } });
    });

    it('should not allow to update preferences with invalid value', async () => {
      const preferences = { hideCommentsOfTypes: [1, 1, true] };
      const res = await updateUserAsync(luna, { preferences });
      expect(res, 'to satisfy', { status: 422 });
    });

    it('should not allow to update preferences with invalid key', async () => {
      const preferences = { hideCommentsOfTypes2: 1 };
      const res = await updateUserAsync(luna, { preferences });
      expect(res, 'to satisfy', { status: 422 });
    });
  })

  describe('"acceptsDirects" flag', () => {
    let luna, mars;

    beforeEach(async () => {
      [luna, mars] = await createTestUsers(2);
    });

    const getLunaInfo = async (anon = false) => {
      const resp = await getUserAsync(anon ? {} : mars, luna.username);
      return await resp.json();
    };

    it('should not accept directs from anonymous', async () => {
      const info = await getLunaInfo(true);
      expect(info, 'to satisfy', { acceptsDirects: false });
    });

    it('should not accept directs from non-friends', async () => {
      const info = await getLunaInfo();
      expect(info, 'to satisfy', { acceptsDirects: false });
    });

    describe('Luna subscribed to Mars', () => {
      beforeEach(async () => {
        await subscribeToAsync(luna, mars);
      });

      it('should accept directs from friends', async () => {
        const info = await getLunaInfo();
        expect(info, 'to satisfy', { acceptsDirects: true });
      });
    });

    describe('Luna accepts directs from all', () => {
      beforeEach(async () => {
        await updateUserAsync(luna, { preferences: { acceptDirectsFrom: 'all' } });
      });

      it('should accept directs from non-friends', async () => {
        const info = await getLunaInfo();
        expect(info, 'to satisfy', { acceptsDirects: true });
      });

      describe('Luna bans Mars', () => {
        beforeEach(async () => {
          await banUser(luna, mars);
        });

        it('should not accept directs from non-friends', async () => {
          const info = await getLunaInfo();
          expect(info, 'to satisfy', { acceptsDirects: false });
        });
      });
    });
  });

  describe('"pastUsernames" field', () => {
    let lunaObj;

    beforeEach(async () => {
      const luna = await createUserAsync('luna', 'pw');
      lunaObj = await dbAdapter.getUserById(luna.user.id);
    });

    const getLunaInfo = async () => {
      const resp = await getUserAsync({}, lunaObj.username);
      return await resp.json();
    };

    it('should return empty array in "pastUsernames"', async () => {
      const info = await getLunaInfo();
      expect(info, 'to satisfy', { pastUsernames: [] });
    });

    describe(`Luna changes username to 'jupiter'`, () => {
      beforeEach(async () => {
        await lunaObj.updateUsername('jupiter');
      });

      it('should return old username in "pastUsernames"', async () => {
        const info = await getLunaInfo();
        expect(info, 'to satisfy', { pastUsernames: [{ username: 'luna' }] });
      });
    });
  });

  describe('updateProfilePicture by URL', () => {
    // Will not test all corner cases here because they are tested in bookmarklet controller test.
    // Just ensure that the userpic-by-url is worked.

    const server = new MockHTTPServer((ctx) => {
      ctx.status = 200;
      ctx.response.type = 'image/gif';
      // 1x1 transparent gif
      ctx.body = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
    });

    before(() => server.start());
    after(() => server.stop());

    let luna;
    beforeEach(async () => {
      luna = await createTestUser();
      await createGroupAsync(luna, 'selenites', 'Selenites', true, false);
    });

    it('should set profile picture by URL', async () => {
      const resp = await performJSONRequest(
        'POST', '/v1/users/updateProfilePicture',
        { url: `${server.origin}/image.gif` },
        { Authorization: `Bearer ${luna.authToken}` }
      );

      expect(resp, 'to satisfy', { __httpCode: 200, message: expect.it('to be a string') });
    });

    it('should set group profile picture by URL', async () => {
      const resp = await performJSONRequest(
        'POST', '/v1/groups/selenites/updateProfilePicture',
        { url: `${server.origin}/image.gif` },
        { Authorization: `Bearer ${luna.authToken}` }
      );

      expect(resp, 'to satisfy', { __httpCode: 200, message: expect.it('to be a string') });
    });
  });

  describe('create user with different parameters', () => {
    it('should create user with custom screenName', async () => {
      const resp = await performJSONRequest('POST', '/v1/users', {
        username:   'marcus',
        password:   'password',
        screenName: 'Marcus Antonius',
      });
      expect(resp, 'to satisfy', {
        __httpCode: 200,
        users:      { username: 'marcus', screenName: 'Marcus Antonius' },
      });
    });

    describe('create user with profile picture by URL', () => {
      const server = new MockHTTPServer((ctx) => {
        ctx.status = 200;
        ctx.response.type = 'image/gif';
        // 1x1 transparent gif
        ctx.body = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
      });

      before(() => server.start());
      after(() => server.stop());

      it('should create user with profile picture by URL', async () => {
        const resp = await performJSONRequest('POST', '/v1/users', {
          username:          'luna',
          password:          'password',
          profilePictureURL: `${server.origin}/image.gif`,
        });
        expect(resp, 'to satisfy', {
          __httpCode: 200,
          users:      { username: 'luna', profilePictureLargeUrl: expect.it('to be a string') },
        });
      });
    });
  });

  describe('create too many users', () => {
    it('should not allow to create more than config.registrationsLimit.maxCount users at once', async () => {
      // Create maxCount users at first
      await createTestUsers(config.registrationsLimit.maxCount + 0);
      const resp = await createUserAsyncPost({ username: 'test', password: 'pw' });
      expect(resp.status, 'to be', 429);
    });
  });

  describe('subscribers/subscriptions order', () => {
    const nUsers = 6;
    let allUsers, user, others, othersByIds;

    beforeEach(async () => {
      allUsers = await createTestUsers(nUsers);
      [user, ...others] = allUsers;

      for (const u of others) {
        await subscribeToAsync(user, u); // eslint-disable-line no-await-in-loop
        await subscribeToAsync(u, user); // eslint-disable-line no-await-in-loop
      }

      others.reverse();
      othersByIds = sortBy([...others], 'user.id');
    });

    it(`should return subscribers to anonymous in IDs order`, async () => {
      const resp = await performJSONRequest('GET', `/v1/users/${user.username}/subscribers`);
      expect(resp, 'to satisfy', { subscribers: othersByIds.map((u) => ({ id: u.user.id })) });
    });

    it(`should return subscribers to other user in IDs order`, async () => {
      const resp = await performJSONRequest('GET', `/v1/users/${user.username}/subscribers`, null, authHeaders(others[0]));
      expect(resp, 'to satisfy', { subscribers: othersByIds.map((u) => ({ id: u.user.id })) });
    });

    it(`should return subscribers to user themself in reverse time order`, async () => {
      const resp = await performJSONRequest('GET', `/v1/users/${user.username}/subscribers`,
        null, authHeaders(user));
      expect(resp, 'to satisfy', { subscribers: others.map((u) => ({ id: u.user.id })) });
    });

    it(`should return subscriptions to anonymous in IDs order`, async () => {
      const resp = await performJSONRequest('GET', `/v1/users/${user.username}/subscriptions`);
      const subscriptionsUsers = uniq(resp.subscriptions.map((s) => s.user));
      expect(subscriptionsUsers, 'to satisfy', othersByIds.map((u) => u.user.id));
    });

    it(`should return subscriptions to other user in IDs order`, async () => {
      const resp = await performJSONRequest('GET', `/v1/users/${user.username}/subscriptions`, null, authHeaders(others[0]));
      const subscriptionsUsers = uniq(resp.subscriptions.map((s) => s.user));
      expect(subscriptionsUsers, 'to satisfy', othersByIds.map((u) => u.user.id));
    });

    it(`should return subscriptions to user themself in reverse time order`, async () => {
      const resp = await performJSONRequest('GET', `/v1/users/${user.username}/subscriptions`,
        null, authHeaders(user));
      const subscriptionsUsers = uniq(resp.subscriptions.map((s) => s.user));
      expect(subscriptionsUsers, 'to satisfy', others.map((u) => u.user.id));
    });

    it(`should return home/subscriptions to user themself in reverse time order`, async () => {
      const resp = await performJSONRequest('GET', `/v2/timelines/home/subscriptions`,
        null, authHeaders(user)
      );

      expect(resp.usersInHomeFeeds, 'to satisfy', others.map((u) => ({ id: u.user.id })));
    });
  });

  describe('gone users', () => {
    let luna, mars;
    beforeEach(async () => {
      [luna, mars] = await createTestUsers(['luna', 'mars']);
      await mutualSubscriptions([luna, mars]);

      // Mars is gone
      await dbAdapter.setUserGoneStatus(mars.user.id, User.GONE_SUSPENDED);
    });

    it(`should return Mars with isGone field in Luna's friends`, async () => {
      const resp = await performJSONRequest('GET', `/v1/users/${luna.username}/subscribers`);
      expect(resp, 'to satisfy', { subscribers: [{ id: mars.user.id, isGone: true }] });
    });
  });
});

