/* eslint-env node, mocha */
/* global $pg_database */
import request from 'superagent'
import knexCleaner from 'knex-cleaner'

import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub } from '../../app/models'
import * as funcTestHelper from './functional_test_helper'


describe('RequestRevocation', () => {
  let app

  before(async () => {
    app = await getSingleton()
    PubSub.setPublisher(new DummyPublisher())
  })

  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  describe('user Luna, private users Mars, Zeus and private group pepyatka-dev', () => {
    let lunaContext = {}
    let marsContext = {}
    let zeusContext = {}

    beforeEach(async () => {
      [lunaContext, marsContext, zeusContext] = await Promise.all([
        funcTestHelper.createUserAsync('luna', 'pw'),
        funcTestHelper.createUserAsync('mars', 'pw'),
        funcTestHelper.createUserAsync('zeus', 'pw')
      ])

      const [,, group] = await Promise.all([
        funcTestHelper.goPrivate(marsContext),
        funcTestHelper.goPrivate(zeusContext),
        funcTestHelper.createGroupAsync(zeusContext, 'pepyatka-dev', 'Pepyatka Developers', true)
      ])

      await Promise.all([
        funcTestHelper.sendRequestToJoinGroup(lunaContext, group),
        funcTestHelper.sendRequestToSubscribe(lunaContext, zeusContext)
      ]);
    })

    it('should reject unauthenticated users', (done) => {
      request
        .post(`${app.context.config.host}/v2/requests/${marsContext.user.username}/revoke`)
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })

    it('should reject nonexisting user', (done) => {
      request
        .post(`${app.context.config.host}/v2/requests/foobar/revoke`)
        .send({ authToken: lunaContext.authToken })
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(404)
          done()
        })
    })

    it('should reject nonexisting subscription request to user', (done) => {
      request
        .post(`${app.context.config.host}/v2/requests/${marsContext.user.username}/revoke`)
        .send({ authToken: lunaContext.authToken })
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(404)
          done()
        })
    })

    it('should reject nonexisting subscription request to group', (done) => {
      request
        .post(`${app.context.config.host}/v2/requests/pepyatka-dev/revoke`)
        .send({ authToken: marsContext.authToken })
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(404)
          done()
        })
    })

    it('should remove existing subscription request to group', (done) => {
      request
        .post(`${app.context.config.host}/v2/requests/pepyatka-dev/revoke`)
        .send({ authToken: lunaContext.authToken })
        .end((err, res) => {
          res.should.not.be.empty
          res.status.should.eql(200)
          // TODO: check lunaContext.whoami (pendingRequests)
          // TODO: check zeusContext.whoami (pendingRequests)
          done()
        })
    })

    it('should remove existing subscription request to user', (done) => {
      request
        .post(`${app.context.config.host}/v2/requests/${zeusContext.user.username}/revoke`)
        .send({ authToken: lunaContext.authToken })
        .end((err, res) => {
          res.should.not.be.empty
          res.status.should.eql(200)
          // TODO: check lunaContext.whoami (pendingRequests)
          // TODO: check zeusContext.whoami (pendingRequests)
          done()
        })
    })
  })
})
