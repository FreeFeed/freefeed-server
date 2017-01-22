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
import * as schema from './schemaV2-helper';

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
        subscribers:                 expect.it('to be an array').and('to be empty').or('to have items exhaustively satisfying', schema.user),
        subscriptions:               expect.it('to be an array').and('to be empty').or('to have items satisfying', schema.UUID),
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
  })
})

