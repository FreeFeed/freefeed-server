/*eslint-env node, mocha */
/*global $database */
import request from 'superagent'
import mkdirp from 'mkdirp'

import { getSingleton } from '../../app/app'
import { load as configLoader } from '../../config/config'
import * as funcTestHelper from './functional_test_helper'


const config = configLoader()

describe("GroupsController", function() {
  let app

  beforeEach(async () => {
    app = await getSingleton()
    await $database.flushdbAsync()
  })

  describe("#create()", function() {
    var context = {}

    beforeEach(funcTestHelper.createUserCtx(context, 'Luna', 'password'))

    it('should reject unauthenticated users', function(done) {
      request
          .post(app.config.host + '/v1/groups')
          .end(function(err, res) {
            err.should.not.be.empty
            err.status.should.eql(401)
            done()
          })
    })

    it('should create a group', function(done) {
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
          done()
        })
    })

    it('should not create a group if a user with that name already exists', function(done) {
      var userName = 'Luna';
      var screenName = 'Pepyatka Developers';
      request
          .post(app.config.host + '/v1/groups')
          .send({ group: {username: userName, screenName: screenName},
            authToken: context.authToken })
          .end(function(err, res) {
            err.should.not.be.empty
            err.status.should.eql(422)
            done()
          })
    })

    it('should not create a group with slash in its name', function(done) {
      var userName = 'Lu/na';
      var screenName = 'Pepyatka Developers';
      request
          .post(app.config.host + '/v1/groups')
          .send({ group: {username: userName, screenName: screenName},
            authToken: context.authToken })
          .end(function(err, res) {
            err.should.not.be.empty
            err.status.should.eql(422)
            err.response.error.should.have.property('text')
            JSON.parse(err.response.error.text).err.should.eql('Invalid username')
            done()
          })
    })

    it('should not create a group with an empty username', function(done) {
      var userName = '';
      var screenName = '';
      request
          .post(app.config.host + '/v1/groups')
          .send({ group: {username: userName, screenName: screenName},
            authToken: context.authToken })
          .end(function(err, res) {
            err.should.not.be.empty
            err.status.should.eql(422)
            err.response.error.should.have.property('text')
            JSON.parse(err.response.error.text).err.should.eql('Invalid username')
            done()
          })
    })

    it('should add the creating user as the administrator', function(done) {
      var userName = 'pepyatka-dev';
      var screenName = 'Pepyatka Developers';
      request
          .post(app.config.host + '/v1/groups')
          .send({ group: {username: userName, screenName: screenName},
            authToken: context.authToken })
          .end(function(err, res) {
            // TODO[yole] check that the user is an administrator
            done()
          })
    })

    it('should subscribe the creating user', function(done) {
      var userName = 'pepyatka-dev';
      var screenName = 'Pepyatka Developers';
      request
          .post(app.config.host + '/v1/groups')
          .send({ group: {username: userName, screenName: screenName},
            authToken: context.authToken })
          .end(function(err, res) {
            var newGroupId = res.body.groups.id
            request
                .get(app.config.host + '/v1/users/Luna/subscriptions')
                .query({ authToken: context.authToken })
                .end(function(err, res) {
                  res.status.should.not.eql(404)
                  res.status.should.not.eql(422)
                  res.body.should.not.be.empty
                  res.body.should.have.property('subscribers')
                  res.body.should.have.property('subscriptions')
                  var subIds = res.body.subscriptions.map(function(sub) { return sub.user })
                  subIds.should.contain(newGroupId)
                  var users = res.body.subscribers
                  users.length.should.eql(1)
                  users[0].type.should.eql("group")
                  done()
                })
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
          .send({ group: {username: 'pepyatka-dev', screenName: 'Pepyatka Developers'},
            authToken: adminContext.authToken })
          .end(function(err, res) {
            done()
          })

    })

    it('should reject unauthenticated users', function(done) {
      request
          .post(app.config.host + '/v1/groups/pepyatka-dev/subscribers/yole/admin')
          .end(function(err, res) {
            err.should.not.be.empty
            err.status.should.eql(403)
            done()
          })
    })

    it('should reject nonexisting group', function(done) {
      request
          .post(app.config.host + '/v1/groups/foobar/subscribers/yole/admin')
          .end(function(err, res) {
            err.should.not.be.empty
            err.status.should.eql(404)
            done()
          })
    })
    it('should allow an administrator to add another administrator', function(done) {
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
        .send({ group: {username: 'pepyatka-dev', screenName: 'Pepyatka Developers'},
                authToken: context.authToken
              })
        .end(function(err, res) {
          group = res.body.groups
          done()
        })
    })

    it('should update group settings', function(done) {
      var screenName = 'mokum-dev'
      var description = 'Mokum Developers'

      request
        .post(app.config.host + '/v1/users/' + group.id)
        .send({ authToken: context.authToken,
                user: { screenName: screenName, description: description },
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
          done()
        })
    })

    it("should not reset description if it's not provided", async () => {
      var oldScreenName = group.screenName
      var newScreenName = 'vanilla-dev'
      var newDescription = 'Vanilla Developer(s)'

      // First, check screenName and description (should be the old ones)
      {
        const response = await funcTestHelper.getUserAsync({}, group.username)
        response.status.should.equal(200)

        const data = await response.json()
        data.should.have.property('users')
        data.users.should.have.property('screenName')
        data.users.screenName.should.eql(oldScreenName) // old screenName
        data.users.should.not.have.property('description') // no description property (since it's empty)
      }

      // Second, only update description (screenName shouldn't change)
      {
        const userContext = {
          user: group,
          authToken: context.authToken
        }
        await funcTestHelper.updateUserAsync(userContext, {
          description: newDescription
        })

        const response = await funcTestHelper.getUserAsync({}, group.username)
        response.status.should.equal(200)

        const data = await response.json()
        data.should.have.property('users')
        data.users.should.have.property('screenName')
        data.users.screenName.should.eql(oldScreenName) // old screenName
        data.users.should.have.property('description')
        data.users.description.should.eql(newDescription) // new description
      }

      // Third, only update screenName (description shouldn't change)
      {
        const userContext = {
          user: group,
          authToken: context.authToken
        }
        await funcTestHelper.updateUserAsync(userContext, {
          screenName: newScreenName
        })

        const response = await funcTestHelper.getUserAsync({}, group.username)
        response.status.should.equal(200)

        const data = await response.json()
        data.should.have.property('users')
        data.users.should.have.property('screenName')
        data.users.screenName.should.eql(newScreenName) // new screenName
        data.users.should.have.property('description')
        data.users.description.should.eql(newDescription) // new description
      }
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
          .send({ group: {username: 'pepyatka-dev', screenName: 'Pepyatka Developers'},
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

    it('should allow an administrator to remove another administrator', function(done) {
      request
          .post(app.config.host + '/v1/groups/pepyatka-dev/subscribers/yole/unadmin')
          .send({ authToken: adminContext.authToken })
          .end(function(err, res) {
            res.status.should.eql(200)
            done()
          })
    })
  })

  describe('#updateProfilePicture', function() {
    var context = {}

    beforeEach(funcTestHelper.createUserCtx(context, 'Luna', 'password'))

    beforeEach(function(done){
      mkdirp.sync(config.profilePictures.storage.rootDir + config.profilePictures.path)
      done()
    })

    beforeEach(function(done) {
      request
        .post(app.config.host + '/v1/groups')
        .send({ group: {username: 'pepyatka-dev', screenName: 'Pepyatka Developers'},
          authToken: context.authToken })
        .end(function(err, res) {
          done()
        })
    })

    it('should update the profile picture', function(done) {
      request
        .post(app.config.host + '/v1/groups/pepyatka-dev/updateProfilePicture')
        .set('X-Authentication-Token', context.authToken)
        .attach('file', 'test/fixtures/default-userpic-75.gif')
        .end(function(err, res) {
          res.status.should.eql(200)
          res.body.should.not.be.empty
          request
            .get(app.config.host + '/v1/users/pepyatka-dev')
            .query({ authToken: context.authToken })
            .end(function(err, res) {
              res.should.not.be.empty
              res.body.users.profilePictureLargeUrl.should.not.be.empty
              done()
            })
        })
    })
  })

  describe('#unsubscribeFromGroup', function() {
    var adminContext = {}
      , secondAdminContext = {}
      , groupMemberContext = {}
      , group

    beforeEach(funcTestHelper.createUserCtx(adminContext, 'Luna', 'password'))
    beforeEach(funcTestHelper.createUserCtx(secondAdminContext, 'Neptune', 'password'))
    beforeEach(funcTestHelper.createUserCtx(groupMemberContext, 'Pluto', 'wordpass'))

    beforeEach(function(done) {
      request
        .post(app.config.host + '/v1/groups')
        .send({ group: {username: 'pepyatka-dev', screenName: 'Pepyatka Developers', isPrivate: '0'},
          authToken: adminContext.authToken })
        .end(function(err, res) {
          group = res.body.groups
          request
            .post(app.config.host + '/v1/users/pepyatka-dev/subscribe')
            .send({ authToken: secondAdminContext.authToken })
            .end(function(err, res) {
              request
                .post(app.config.host + '/v1/groups/pepyatka-dev/subscribers/' + secondAdminContext.user.username +'/admin')
                .send({authToken: adminContext.authToken })
                .end(function(err, res) {
                  request
                    .post(app.config.host + '/v1/users/pepyatka-dev/subscribe')
                    .send({ authToken: groupMemberContext.authToken })
                    .end(function(err, res) {
                      done()
                    })
                })
            })
        })
    })

    it('admins should be able to unsubscribe user from group', function (done) {
      request
        .post(app.config.host + '/v1/groups/pepyatka-dev/unsubscribeFromGroup/' + groupMemberContext.user.username)
        .send({ authToken: adminContext.authToken,
          '_method': 'post' })
        .end(function (err, res) {
          res.status.should.eql(200)
          res.should.not.be.empty
          res.error.should.be.empty
          done()
        })
    })

    it('should not allow to unsubscribe admins from group', function(done) {
      request
        .post(app.config.host + '/v1/groups/pepyatka-dev/unsubscribeFromGroup/' + secondAdminContext.user.username)
        .send({ authToken: adminContext.authToken })
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(403)
          done()
        })
    })
  })
})
