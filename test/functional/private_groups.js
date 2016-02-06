/*eslint-env node, mocha */
/*global $database */
import request from 'superagent'
import mkdirp from 'mkdirp'

import { getSingleton } from '../../app/app'
import { load as configLoader } from '../../config/config'
import * as funcTestHelper from './functional_test_helper'


const config = configLoader()

describe("GroupsController1", function() {
  let app

  beforeEach(async () => {
    app = await getSingleton()
    await $database.flushdbAsync()
  })

  describe("#create()", function() {
    var context = {}

    beforeEach(funcTestHelper.createUserCtx(context, 'Luna', 'password'))

    it('should create a public not-restricted group by default', function(done) {
      var userName = 'pepyatka-dev';
      var screenName = 'Pepyatka Developers';
      request
        .post(app.config.host + '/v1/groups')
        .send({ group: {username: userName, screenName: screenName},
          authToken: context.authToken })
        .end(function(err, res) {
          res.body.should.not.be.empty
          res.body.should.have.property('groups')
          res.body.groups.should.have.property('username')
          res.body.groups.should.have.property('screenName')
          res.body.groups.username.should.eql(userName)
          res.body.groups.screenName.should.eql(screenName)
          res.body.groups.isPrivate.should.eql('0')
          res.body.groups.isRestricted.should.eql('0')
          done()
        })
    })

    it('should create a private group', function(done) {
      var userName = 'pepyatka-dev';
      var screenName = 'Pepyatka Developers';
      request
        .post(app.config.host + '/v1/groups')
        .send({ group: {username: userName, screenName: screenName, isPrivate: '1'},
          authToken: context.authToken })
        .end(function(err, res) {
          res.body.should.not.be.empty
          res.body.should.have.property('groups')
          res.body.groups.isPrivate.should.eql('1')
          res.body.groups.isRestricted.should.eql('0')
          done()
        })
    })

    it('should create a public restricted group', function(done) {
      var userName = 'pepyatka-dev';
      var screenName = 'Pepyatka Developers';
      request
        .post(app.config.host + '/v1/groups')
        .send({ group: {username: userName, screenName: screenName, isRestricted: '1'},
          authToken: context.authToken })
        .end(function(err, res) {
          res.body.should.not.be.empty
          res.body.should.have.property('groups')
          res.body.groups.isPrivate.should.eql('0')
          res.body.groups.isRestricted.should.eql('1')
          done()
        })
    })

    it('should create a private restricted group', function(done) {
      var userName = 'pepyatka-dev';
      var screenName = 'Pepyatka Developers';
      request
        .post(app.config.host + '/v1/groups')
        .send({ group: {username: userName, screenName: screenName, isPrivate: '1', isRestricted: '1'},
          authToken: context.authToken })
        .end(function(err, res) {
          res.body.should.not.be.empty
          res.body.should.have.property('groups')
          res.body.groups.isPrivate.should.eql('1')
          res.body.groups.isRestricted.should.eql('1')
          done()
        })
    })
  })

  describe('#admin', function() {
    var adminContext = {}
      , nonAdminContext = {}

    beforeEach(funcTestHelper.createUserCtx(adminContext, 'Luna', 'password'))
    beforeEach(funcTestHelper.createUserCtx(nonAdminContext, 'yole', 'wordpass'))

    beforeEach(function(done) {
      request
          .post(app.config.host + '/v1/groups')
          .send({ group: {username: 'pepyatka-dev', screenName: 'Pepyatka Developers', isPrivate: '1'},
            authToken: adminContext.authToken })
          .end(function(err, res) {
            done()
          })

    })

    it('should allow an administrator of private group to add another administrator', function(done) {
      request
          .post(app.config.host + '/v1/groups/pepyatka-dev/subscribers/yole/admin')
          .send({authToken: adminContext.authToken })
          .end(function(err, res) {
            res.status.should.eql(200)
            done()
          })
    })
  })

  describe('#update', function() {
    var context = {}
      , group

    beforeEach(funcTestHelper.createUserCtx(context, 'Luna', 'password'))

    beforeEach(function(done) {
      request
        .post(app.config.host + '/v1/groups')
        .send({ group: {username: 'pepyatka-dev', screenName: 'Pepyatka Developers', isPrivate: '1' },
                authToken: context.authToken
              })
        .end(function(err, res) {
          group = res.body.groups
          done()
        })
    })

    it('should update private group settings', function(done) {
      var screenName = 'mokum-dev'
      var description = 'Mokum Developers'

      request
        .post(app.config.host + '/v1/users/' + group.id)
        .send({ authToken: context.authToken,
                user: { screenName: screenName, description: description,},
                '_method': 'put' })
        .end(function(err, res) {
          res.should.not.be.empty
          res.body.should.not.be.empty
          res.body.should.have.property('groups')
          res.body.groups.should.have.property('id')
          res.body.groups.should.have.property('screenName')
          res.body.groups.screenName.should.eql(screenName)
          res.body.groups.should.have.property('description')
          res.body.groups.description.should.eql(description)
          res.body.groups.should.have.property('isPrivate')
          res.body.groups.isPrivate.should.eql('1')
          res.body.groups.should.have.property('isRestricted')
          res.body.groups.isRestricted.should.eql('0')
          done()
        })
    })

    it('should update group isRestricted', function(done) {
      request
        .post(app.config.host + '/v1/users/' + group.id)
        .send({ authToken: context.authToken,
          user: { isRestricted: '1'},
          '_method': 'put' })
        .end(function(err, res) {
          res.should.not.be.empty
          res.body.should.not.be.empty
          res.body.should.have.property('groups')
          res.body.groups.should.have.property('id')
          res.body.groups.should.have.property('isPrivate')
          res.body.groups.isPrivate.should.eql('1')
          res.body.groups.should.have.property('isRestricted')
          res.body.groups.isRestricted.should.eql('1')
          done()
        })
    })

    it('should update group isPrivate', function(done) {
      request
        .post(app.config.host + '/v1/users/' + group.id)
        .send({ authToken: context.authToken,
          user: { isPrivate: '0'},
          '_method': 'put' })
        .end(function(err, res) {
          res.should.not.be.empty
          res.body.should.not.be.empty
          res.body.should.have.property('groups')
          res.body.groups.should.have.property('id')
          res.body.groups.should.have.property('isPrivate')
          res.body.groups.isPrivate.should.eql('0')
          res.body.groups.should.have.property('isRestricted')
          res.body.groups.isRestricted.should.eql('0')
          done()
        })
    })
  })

  describe('#unadmin', function() {
    var adminContext = {}
      , nonAdminContext = {}

    beforeEach(funcTestHelper.createUserCtx(adminContext, 'Luna', 'password'))
    beforeEach(funcTestHelper.createUserCtx(nonAdminContext, 'yole', 'wordpass'))

    beforeEach(function(done) {
      request
          .post(app.config.host + '/v1/groups')
          .send({ group: {username: 'pepyatka-dev', screenName: 'Pepyatka Developers', isPrivate: '1'},
            authToken: adminContext.authToken })
          .end(function(err, res) {
            done()
          })

    })

    beforeEach(function(done) {
      request
          .post(app.config.host + '/v1/groups/pepyatka-dev/subscribers/yole/admin')
          .send({ authToken: adminContext.authToken })
          .end(function(err, res) {
            done()
          })
    })

    it('should allow an administrator of private group to remove another administrator', function(done) {
      request
          .post(app.config.host + '/v1/groups/pepyatka-dev/subscribers/yole/unadmin')
          .send({ authToken: adminContext.authToken })
          .end(function(err, res) {
            res.status.should.eql(200)
            done()
          })
    })
  })

  describe('#sendRequest', function() {
    var adminContext = {}
      , nonAdminContext = {}
      , group

    beforeEach(funcTestHelper.createUserCtx(adminContext, 'Luna', 'password'))
    beforeEach(funcTestHelper.createUserCtx(nonAdminContext, 'yole', 'wordpass'))

    beforeEach(function(done) {
      request
        .post(app.config.host + '/v1/groups')
        .send({ group: {username: 'pepyatka-dev', screenName: 'Pepyatka Developers', isPrivate: '1'},
          authToken: adminContext.authToken })
        .end(function(err, res) {
          group = res.body.groups
          done()
        })
    })

    it('should reject unauthenticated users', function(done) {
      request
        .post(app.config.host + '/v1/groups/pepyatka-dev/sendRequest')
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })

    it('should reject nonexisting group', function(done) {
      request
        .post(app.config.host + '/v1/groups/foobar/sendRequest')
        .send({ authToken: nonAdminContext.authToken })
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(404)
          done()
        })
    })

    it('should allow user to send subscription request to private group', function(done) {
      request
        .post(app.config.host + '/v1/groups/pepyatka-dev/sendRequest')
        .send({ authToken: nonAdminContext.authToken })
        .end(function(err, res) {
          res.status.should.eql(200)
          done()
        })
    })

    it('should not allow user to send subscription request to private group twice', function(done) {
      request
        .post(app.config.host + '/v1/groups/pepyatka-dev/sendRequest')
        .send({ authToken: nonAdminContext.authToken })
        .end(function(err, res) {
          res.status.should.eql(200)
          request
            .post(app.config.host + '/v1/groups/pepyatka-dev/sendRequest')
            .send({ authToken: nonAdminContext.authToken })
            .end(function(err, res) {
              res.status.should.eql(403)
              done()
            })
        })
    })

    it('should not allow user to send subscription request to public group', function(done) {
      request
        .post(app.config.host + '/v1/users/' + group.id)
        .send({ authToken: adminContext.authToken,
          user: { isPrivate: '0'},
          '_method': 'put' })
        .end(function(err, res) {
          request
            .post(app.config.host + '/v1/groups/pepyatka-dev/sendRequest')
            .send({ authToken: nonAdminContext.authToken })
            .end(function(err, res) {
              res.status.should.eql(422)
              done()
            })
        })

    })

    it('should not allow subscriber user to send subscription request to private group', function(done) {
      request
        .post(app.config.host + '/v1/groups/pepyatka-dev/sendRequest')
        .send({ authToken: nonAdminContext.authToken })
        .end(function(err, res) {
          request
            .post(app.config.host + '/v1/groups/pepyatka-dev/acceptRequest' + nonAdminContext.user.username)
            .send({ authToken: adminContext.authToken,
              '_method': 'post' })
            .end(function(err, res) {
              request
                .post(app.config.host + '/v1/groups/pepyatka-dev/sendRequest')
                .send({ authToken: nonAdminContext.authToken })
                .end(function(err, res) {
                  res.status.should.eql(403)
                  done()
                })
            })
        })
    })

  })
})
