/*eslint-env node, mocha */
/*global $database */
import request from 'superagent'
import _ from 'lodash'

import { getSingleton } from '../../app/app'
import * as funcTestHelper from './functional_test_helper'


describe("RequestRevocation", () => {
  let app

  beforeEach(async () => {
    app = await getSingleton()
    await $database.flushdbAsync()
  })

  describe('user Luna, private users Mars, Zeus and private group pepyatka-dev', () => {
    let lunaContext = {}
    let marsContext = {}
    let zeusContext = {}

    beforeEach(funcTestHelper.createUserCtx(lunaContext, 'luna', 'pw'))
    beforeEach(funcTestHelper.createUserCtx(marsContext, 'mars', 'pw'))
    beforeEach(funcTestHelper.createUserCtx(zeusContext, 'zeus', 'pw'))
    beforeEach(() => funcTestHelper.goPrivate(marsContext))
    beforeEach(() => funcTestHelper.goPrivate(zeusContext))

    beforeEach((done) => {
      request
        .post(app.config.host + '/v1/groups')
        .send({ group: {username: 'pepyatka-dev', screenName: 'Pepyatka Developers', isPrivate: '1'},
          authToken: zeusContext.authToken })
        .end(function(err, res) {
          request
            .post(app.config.host + '/v1/groups/pepyatka-dev/sendRequest')
            .send({ authToken: lunaContext.authToken })
            .end(function(err, res) {
              request
                .post(app.config.host + `/v1/users/${zeusContext.user.username}/sendRequest`)
                .send({ authToken: lunaContext.authToken })
                .end(function(err, res) {
                  done()
                })
            })
        })
    })

    it('should reject unauthenticated users', function(done) {
      request
        .post(app.config.host + `/v2/requests/${marsContext.user.username}/revoke`)
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })

    it('should reject nonexisting user', function(done) {
      request
        .post(app.config.host + '/v2/requests/foobar/revoke')
        .send({ authToken: lunaContext.authToken })
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(404)
          done()
        })
    })

    it('should reject nonexisting subscription request to user', function(done) {
      request
        .post(app.config.host + `/v2/requests/${marsContext.user.username}/revoke`)
        .send({ authToken: lunaContext.authToken })
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(404)
          done()
        })
    })

    it('should reject nonexisting subscription request to group', function(done) {
      request
        .post(app.config.host + `/v2/requests/pepyatka-dev/revoke`)
        .send({ authToken: marsContext.authToken })
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(404)
          done()
        })
    })

    it('should remove existing subscription request to group', function(done) {
      request
        .post(app.config.host + `/v2/requests/pepyatka-dev/revoke`)
        .send({ authToken: lunaContext.authToken })
        .end(function(err, res) {
          res.should.not.be.empty
          res.status.should.eql(200)
          // TODO: check lunaContext.whoami (pendingRequests)
          // TODO: check zeusContext.whoami (pendingRequests)
          done()
        })
    })

    it('should remove existing subscription request to user', function(done) {
      request
        .post(app.config.host + `/v2/requests/${zeusContext.user.username}/revoke`)
        .send({ authToken: lunaContext.authToken })
        .end(function(err, res) {
          res.should.not.be.empty
          res.status.should.eql(200)
          // TODO: check lunaContext.whoami (pendingRequests)
          // TODO: check zeusContext.whoami (pendingRequests)
          done()
        })
    })
  })
})
