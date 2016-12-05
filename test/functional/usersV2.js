/* eslint-env node, mocha */
/* global $pg_database */
import fetch from 'node-fetch'
import request from 'superagent'
import knexCleaner from 'knex-cleaner'
import expect from 'unexpected'

import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub } from '../../app/models'
import {
  createUserAsync,
  mutualSubscriptions,
  subscribeToAsync,
  createGroupAsync,
  sendRequestToJoinGroup,
} from '../functional/functional_test_helper'


describe('UsersControllerV2', () => {
  let app

  before(async () => {
    app = await getSingleton()
    PubSub.setPublisher(new DummyPublisher())
  })

  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  describe('#blockedByMe()', () => {
    it('should reject unauthenticated users', (done) => {
      request
        .get(`${app.config.host}/v2/users/blockedByMe`)
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

      await fetch(`${app.config.host}/v1/users/${userB.username}/ban`, {
        method:  'POST',
        headers: { 'X-Authentication-Token': userAResponse.authToken }
      })

      const blockedByMeResponse = await fetch(`${app.config.host}/v2/users/blockedbyme`, { headers: { 'X-Authentication-Token': userAResponse.authToken } })

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
        .get(`${app.config.host}/v2/users/whoami`)
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
      ] = await Promise.all([
        createUserAsync('luna', 'pw'),
        createUserAsync('mars', 'pw'),
        createUserAsync('venus', 'pw'),
        createUserAsync('zeus', 'pw'),
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

      const whoAmI = await fetch(`${app.config.host}/v2/users/whoami`, { headers: { 'X-Authentication-Token': luna.authToken } }).then((r) => r.json());

      const userSchema = {
        id:                      expect.it('to be a string'),
        username:                expect.it('to be a string'),
        screenName:              expect.it('to be a string'),
        isPrivate:               expect.it('to be a string').and('to be one of', ['0', '1']),
        isProtected:             expect.it('to be a string').and('to be one of', ['0', '1']),
        isVisibleToAnonymous:    expect.it('to be a string').and('to be one of', ['0', '1']),
        createdAt:               expect.it('to be a string').and('to match', /^\d+$/),
        updatedAt:               expect.it('to be a string').and('to match', /^\d+$/),
        type:                    expect.it('to equal', 'user'),
        profilePictureLargeUrl:  expect.it('to be a string'),
        profilePictureMediumUrl: expect.it('to be a string'),
      };

      const groupSchema = {
        ...userSchema,
        isRestricted:   expect.it('to be a string').and('to be one of', ['0', '1']),
        type:           expect.it('to equal', 'group'),
        administrators: expect.it('to be an array').and('to have items satisfying', 'to be a string'),
      };

      const managedGroupSchema = {
        ...groupSchema,
        requests: expect.it('to be an array').and('to be empty').or('to have items exhaustively satisfying', userSchema),
      };

      const userOrGroup = (obj) => {
        const isGroup = obj && typeof obj === 'object' && obj.type === 'group';
        return expect(obj, 'to exhaustively satisfy', isGroup ? groupSchema : userSchema);
      };

      const thisUserSchema = {
        ...userSchema,
        email:                       expect.it('to be a string'),
        description:                 expect.it('to be a string'),
        privateMeta:                 expect.it('to be an object'),
        frontendPreferences:         expect.it('to be an object'),
        statistics:                  expect.it('to be an object'),
        banIds:                      expect.it('to be an array').and('to be empty').or('to have items satisfying', 'to be a string'),
        pendingGroupRequests:        expect.it('to be a boolean'),
        pendingSubscriptionRequests: expect.it('to be an array').and('to be empty').or('to have items satisfying', 'to be a string'),
        subscriptionRequests:        expect.it('to be an array').and('to be empty').or('to have items satisfying', 'to be a string'),
        unreadDirectsNumber:         expect.it('to be a string').and('to match', /^\d+$/),
        subscribers:                 expect.it('to be an array').and('to be empty').or('to have items exhaustively satisfying', userSchema),
        subscriptions:               expect.it('to be an array').and('to be empty').or('to have items satisfying', 'to be a string'),
      };

      expect(whoAmI, 'to exhaustively satisfy', {
        users:         thisUserSchema,
        subscribers:   expect.it('to be an array').and('to be empty').or('to have items exhaustively satisfying', userOrGroup),
        subscriptions: expect.it('to be an array').and('to be empty').or('to have items exhaustively satisfying', {
          id:   expect.it('to be a string'),
          name: expect.it('to be a string'),
          user: expect.it('to be a string'),
        }),
        requests:      expect.it('to be an array').and('to be empty').or('to have items exhaustively satisfying', userOrGroup),
        managedGroups: expect.it('to be an array').and('to be empty').or('to have items exhaustively satisfying', managedGroupSchema),
      });
    });
  })
})

