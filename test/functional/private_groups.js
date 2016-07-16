/*eslint-env node, mocha */
/*global $pg_database */
import request from 'superagent'
import knexCleaner from 'knex-cleaner'

import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub } from '../../app/models'
import * as funcTestHelper from './functional_test_helper'


describe('PrivateGroups', function () {
  let app

  before(async () => {
    app = await getSingleton()
    PubSub.setPublisher(new DummyPublisher())
  })

  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  describe('#create()', function () {
    var context = {}

    beforeEach(funcTestHelper.createUserCtx(context, 'Luna', 'password'))

    it('should create a public not-restricted group by default', function (done) {
      var userName = 'pepyatka-dev';
      var screenName = 'Pepyatka Developers';
      request
        .post(app.config.host + '/v1/groups')
        .send({
          group: { username: userName, screenName },
          authToken: context.authToken
        })
        .end(function (err, res) {
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

    it('should create a private group', function (done) {
      var userName = 'pepyatka-dev';
      var screenName = 'Pepyatka Developers';
      request
        .post(app.config.host + '/v1/groups')
        .send({
          group: { username: userName, screenName, isPrivate: '1' },
          authToken: context.authToken
        })
        .end(function (err, res) {
          res.body.should.not.be.empty
          res.body.should.have.property('groups')
          res.body.groups.isPrivate.should.eql('1')
          res.body.groups.isRestricted.should.eql('0')
          done()
        })
    })

    it('should create a public restricted group', function (done) {
      var userName = 'pepyatka-dev';
      var screenName = 'Pepyatka Developers';
      request
        .post(app.config.host + '/v1/groups')
        .send({
          group: { username: userName, screenName, isRestricted: '1' },
          authToken: context.authToken
        })
        .end(function (err, res) {
          res.body.should.not.be.empty
          res.body.should.have.property('groups')
          res.body.groups.isPrivate.should.eql('0')
          res.body.groups.isRestricted.should.eql('1')
          done()
        })
    })

    it('should create a private restricted group', function (done) {
      var userName = 'pepyatka-dev';
      var screenName = 'Pepyatka Developers';
      request
        .post(app.config.host + '/v1/groups')
        .send({
          group: { username: userName, screenName, isPrivate: '1', isRestricted: '1' },
          authToken: context.authToken
        })
        .end(function (err, res) {
          res.body.should.not.be.empty
          res.body.should.have.property('groups')
          res.body.groups.isPrivate.should.eql('1')
          res.body.groups.isRestricted.should.eql('1')
          done()
        })
    })
  })

  describe('#admin', function () {
    var adminContext = {}
      , nonAdminContext = {}

    beforeEach(funcTestHelper.createUserCtx(adminContext, 'Luna', 'password'))
    beforeEach(funcTestHelper.createUserCtx(nonAdminContext, 'yole', 'wordpass'))

    beforeEach(function (done) {
      request
          .post(app.config.host + '/v1/groups')
          .send({
            group: { username: 'pepyatka-dev', screenName: 'Pepyatka Developers', isPrivate: '1' },
            authToken: adminContext.authToken
          })
          .end(function () {
            done()
          })

    })

    it('should allow an administrator of private group to add another administrator', function (done) {
      request
          .post(app.config.host + '/v1/groups/pepyatka-dev/subscribers/yole/admin')
          .send({ authToken: adminContext.authToken })
          .end(function (err, res) {
            res.status.should.eql(200)
            done()
          })
    })
  })

  describe('#update', function () {
    var context = {}
      , group

    beforeEach(funcTestHelper.createUserCtx(context, 'Luna', 'password'))

    beforeEach(function (done) {
      request
        .post(app.config.host + '/v1/groups')
        .send({
          group: { username: 'pepyatka-dev', screenName: 'Pepyatka Developers', isPrivate: '1' },
          authToken: context.authToken
        })
        .end(function (err, res) {
          group = res.body.groups
          done()
        })
    })

    it('should update private group settings', function (done) {
      var screenName = 'mokum-dev'
      var description = 'Mokum Developers'

      request
        .post(app.config.host + '/v1/users/' + group.id)
        .send({
          authToken: context.authToken,
          user: { screenName, description },
          '_method': 'put'
        })
        .end(function (err, res) {
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

    it('should update group isRestricted', function (done) {
      request
        .post(app.config.host + '/v1/users/' + group.id)
        .send({
          authToken: context.authToken,
          user: { isRestricted: '1' },
          '_method': 'put'
        })
        .end(function (err, res) {
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

    it('should update group isPrivate', function (done) {
      request
        .post(app.config.host + '/v1/users/' + group.id)
        .send({
          authToken: context.authToken,
          user: { isPrivate: '0' },
          '_method': 'put'
        })
        .end(function (err, res) {
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

  describe('#unadmin', function () {
    var adminContext = {}
      , nonAdminContext = {}

    beforeEach(funcTestHelper.createUserCtx(adminContext, 'Luna', 'password'))
    beforeEach(funcTestHelper.createUserCtx(nonAdminContext, 'yole', 'wordpass'))

    beforeEach(function (done) {
      request
          .post(app.config.host + '/v1/groups')
          .send({
            group: { username: 'pepyatka-dev', screenName: 'Pepyatka Developers', isPrivate: '1' },
            authToken: adminContext.authToken
          })
          .end(function () {
            done()
          })

    })

    beforeEach(function (done) {
      request
          .post(app.config.host + '/v1/groups/pepyatka-dev/subscribers/yole/admin')
          .send({ authToken: adminContext.authToken })
          .end(function () {
            done()
          })
    })

    it('should allow an administrator of private group to remove another administrator', function (done) {
      request
          .post(app.config.host + '/v1/groups/pepyatka-dev/subscribers/yole/unadmin')
          .send({ authToken: adminContext.authToken })
          .end(function (err, res) {
            res.status.should.eql(200)
            done()
          })
    })
  })

  describe('#sendRequest', function () {
    var adminContext = {}
      , nonAdminContext = {}
      , group

    beforeEach(funcTestHelper.createUserCtx(adminContext, 'Luna', 'password'))
    beforeEach(funcTestHelper.createUserCtx(nonAdminContext, 'yole', 'wordpass'))

    beforeEach(function (done) {
      request
        .post(app.config.host + '/v1/groups')
        .send({
          group: { username: 'pepyatka-dev', screenName: 'Pepyatka Developers', isPrivate: '1' },
          authToken: adminContext.authToken
        })
        .end(function (err, res) {
          group = res.body.groups
          done()
        })
    })

    it('should reject unauthenticated users', function (done) {
      request
        .post(app.config.host + '/v1/groups/pepyatka-dev/sendRequest')
        .end(function (err) {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })

    it('should reject nonexisting group', function (done) {
      request
        .post(app.config.host + '/v1/groups/foobar/sendRequest')
        .send({ authToken: nonAdminContext.authToken })
        .end(function (err) {
          err.should.not.be.empty
          err.status.should.eql(404)
          done()
        })
    })

    it('should allow user to send subscription request to private group', function (done) {
      request
        .post(app.config.host + '/v1/groups/pepyatka-dev/sendRequest')
        .send({ authToken: nonAdminContext.authToken })
        .end(function (err, res) {
          res.status.should.eql(200)
          request
            .get(app.config.host + '/v1/users/whoami')
            .query({ authToken: adminContext.authToken })
            .end(function (err, res) {
              res.should.not.be.empty
              res.body.should.not.be.empty
              res.body.should.have.property('users')
              res.body.users.should.have.property('pendingGroupRequests')
              res.body.users.pendingGroupRequests.should.be.true
              done()
            })
        })
    })

    it('should not allow user to send subscription request to private group twice', function (done) {
      request
        .post(app.config.host + '/v1/groups/pepyatka-dev/sendRequest')
        .send({ authToken: nonAdminContext.authToken })
        .end(function (err, res) {
          res.status.should.eql(200)
          request
            .post(app.config.host + '/v1/groups/pepyatka-dev/sendRequest')
            .send({ authToken: nonAdminContext.authToken })
            .end(function (err, res) {
              res.status.should.eql(403)
              done()
            })
        })
    })

    it('should not allow user to send subscription request to public group', function (done) {
      request
        .post(app.config.host + '/v1/users/' + group.id)
        .send({
          authToken: adminContext.authToken,
          user: { isPrivate: '0' },
          '_method': 'put'
        })
        .end(function () {
          request
            .post(app.config.host + '/v1/groups/pepyatka-dev/sendRequest')
            .send({ authToken: nonAdminContext.authToken })
            .end(function (err, res) {
              res.status.should.eql(422)
              done()
            })
        })

    })

    it('should not allow subscriber user to send subscription request to private group', function (done) {
      request
        .post(app.config.host + '/v1/groups/pepyatka-dev/sendRequest')
        .send({ authToken: nonAdminContext.authToken })
        .end(function () {
          request
            .post(app.config.host + '/v1/groups/pepyatka-dev/acceptRequest' + nonAdminContext.user.username)
            .send({
              authToken: adminContext.authToken,
              '_method': 'post'
            })
            .end(function () {
              request
                .post(app.config.host + '/v1/groups/pepyatka-dev/sendRequest')
                .send({ authToken: nonAdminContext.authToken })
                .end(function (err, res) {
                  res.status.should.eql(403)
                  done()
                })
            })
        })
    })

  })

  describe('subscription requests and membership management', function () {
    var adminContext = {}
      , secondAdminContext = {}
      , nonAdminContext = {}
      , groupMemberContext = {}
      , group

    beforeEach(funcTestHelper.createUserCtx(adminContext, 'Luna', 'password'))
    beforeEach(funcTestHelper.createUserCtx(secondAdminContext, 'Neptune', 'password'))
    beforeEach(funcTestHelper.createUserCtx(nonAdminContext, 'yole', 'wordpass'))
    beforeEach(funcTestHelper.createUserCtx(groupMemberContext, 'Pluto', 'wordpass'))

    beforeEach(async () => {
      const response = await funcTestHelper.createGroupAsync(adminContext, 'pepyatka-dev', 'Pepyatka Developers')
      group = response.group

      await funcTestHelper.subscribeToAsync(secondAdminContext, group)
      await funcTestHelper.subscribeToAsync(groupMemberContext, group)

      await funcTestHelper.promoteToAdmin(group, adminContext, secondAdminContext)
      await funcTestHelper.groupToPrivate(group, adminContext)

      await funcTestHelper.createAndReturnPostToFeed(group, adminContext, 'Post body')

      await funcTestHelper.sendRequestToJoinGroup(nonAdminContext, group)
    })

    describe('#acceptRequest', function () {
      it('should reject unauthenticated users', function (done) {
        request
          .post(app.config.host + '/v1/groups/pepyatka-dev/acceptRequest/' + nonAdminContext.user.username)
          .end(function (err) {
            err.should.not.be.empty
            err.status.should.eql(401)
            done()
          })
      })

      it('should reject nonexisting group', function (done) {
        request
          .post(app.config.host + '/v1/groups/foobar/acceptRequest/' + nonAdminContext.user.username)
          .send({ authToken: adminContext.authToken })
          .end(function (err) {
            err.should.not.be.empty
            err.status.should.eql(404)
            done()
          })
      })

      it('should reject nonexisting user', function (done) {
        request
          .post(app.config.host + '/v1/groups/pepyatka-dev/acceptRequest/foobar')
          .send({ authToken: adminContext.authToken })
          .end(function (err) {
            err.should.not.be.empty
            err.status.should.eql(404)
            done()
          })
      })

      it('should not allow non-admins to accept subscription request', function (done) {
        request
          .post(app.config.host + '/v1/groups/pepyatka-dev/acceptRequest/' + nonAdminContext.user.username)
          .send({ authToken: groupMemberContext.authToken })
          .end(function (err) {
            err.should.not.be.empty
            err.status.should.eql(403)
            done()
          })
      })

      it('should be able to accept subscription request', function (done) {
        request
          .post(app.config.host + '/v1/groups/pepyatka-dev/acceptRequest/' + nonAdminContext.user.username)
          .send({
            authToken: adminContext.authToken,
            '_method': 'post'
          })
          .end(function (err, res) {
            res.status.should.eql(200)
            res.should.not.be.empty
            res.error.should.be.empty

            request
              .get(app.config.host + '/v1/users/whoami')
              .query({ authToken: adminContext.authToken })
              .end(function (err, res) {
                res.should.not.be.empty
                res.body.should.not.be.empty
                res.body.should.have.property('users')
                res.body.users.should.have.property('pendingGroupRequests')
                res.body.users.pendingGroupRequests.should.be.false


                funcTestHelper.getTimeline('/v1/timelines/home', nonAdminContext.authToken, function (err, res) {
                  res.should.not.be.empty
                  res.body.should.not.be.empty
                  res.body.should.have.property('timelines')
                  res.body.timelines.should.have.property('name')
                  res.body.timelines.name.should.eql('RiverOfNews')
                  res.body.timelines.should.have.property('posts')
                  res.body.timelines.posts.length.should.eql(1)
                  res.body.should.have.property('posts')
                  res.body.posts.length.should.eql(1)
                  var post = res.body.posts[0]
                  post.body.should.eql('Post body')
                  done()
                })
              })
          })
      })


      it('should not allow to accept non-existent subscription request', function (done) {
        request
          .post(app.config.host + '/v1/groups/pepyatka-dev/acceptRequest/' + groupMemberContext.user.username)
          .send({ authToken: adminContext.authToken })
          .end(function (err) {
            err.should.not.be.empty
            err.status.should.eql(422)
            done()
          })
      })

      it('should not allow to accept subscription request twice', function (done) {
        request
          .post(app.config.host + '/v1/groups/pepyatka-dev/acceptRequest/' + nonAdminContext.user.username)
          .send({ authToken: adminContext.authToken })
          .end(function (err, res) {
            res.status.should.eql(200)
            request
              .post(app.config.host + '/v1/groups/pepyatka-dev/acceptRequest/' + nonAdminContext.user.username)
              .send({ authToken: adminContext.authToken })
              .end(function (err) {
                err.should.not.be.empty
                err.status.should.eql(422)
                done()
              })
          })
      })
    })

    describe('#rejectRequest', function () {
      it('should reject unauthenticated users', function (done) {
        request
          .post(app.config.host + '/v1/groups/pepyatka-dev/rejectRequest/' + nonAdminContext.user.username)
          .end(function (err) {
            err.should.not.be.empty
            err.status.should.eql(401)
            done()
          })
      })

      it('should reject nonexisting group', function (done) {
        request
          .post(app.config.host + '/v1/groups/foobar/rejectRequest/' + nonAdminContext.user.username)
          .send({ authToken: adminContext.authToken })
          .end(function (err) {
            err.should.not.be.empty
            err.status.should.eql(404)
            done()
          })
      })

      it('should reject nonexisting user', function (done) {
        request
          .post(app.config.host + '/v1/groups/pepyatka-dev/rejectRequest/foobar')
          .send({ authToken: adminContext.authToken })
          .end(function (err) {
            err.should.not.be.empty
            err.status.should.eql(404)
            done()
          })
      })

      it('should not allow non-admins to reject subscription request', function (done) {
        request
          .post(app.config.host + '/v1/groups/pepyatka-dev/rejectRequest/' + nonAdminContext.user.username)
          .send({ authToken: groupMemberContext.authToken })
          .end(function (err) {
            err.should.not.be.empty
            err.status.should.eql(403)
            done()
          })
      })

      it('should be able to reject subscription request', function (done) {
        request
          .post(app.config.host + '/v1/groups/pepyatka-dev/rejectRequest/' + nonAdminContext.user.username)
          .send({
            authToken: adminContext.authToken,
            '_method': 'post'
          })
          .end(function (err, res) {
            res.status.should.eql(200)
            res.should.not.be.empty
            res.error.should.be.empty

            request
              .get(app.config.host + '/v1/users/whoami')
              .query({ authToken: adminContext.authToken })
              .end(function (err, res) {
                res.should.not.be.empty
                res.body.should.not.be.empty
                res.body.should.have.property('users')
                res.body.users.should.have.property('pendingGroupRequests')
                res.body.users.pendingGroupRequests.should.be.false


                funcTestHelper.getTimeline('/v1/timelines/home', nonAdminContext.authToken, function (err, res) {
                  res.should.not.be.empty
                  res.body.should.not.be.empty
                  res.body.should.have.property('timelines')
                  res.body.timelines.should.have.property('name')
                  res.body.timelines.name.should.eql('RiverOfNews')
                  res.body.timelines.should.not.have.property('posts')
                  res.body.should.not.have.property('posts')
                  done()
                })
              })
          })
      })


      it('should not allow to reject non-existent subscription request', function (done) {
        request
          .post(app.config.host + '/v1/groups/pepyatka-dev/rejectRequest/' + groupMemberContext.user.username)
          .send({ authToken: adminContext.authToken })
          .end(function (err) {
            err.should.not.be.empty
            err.status.should.eql(422)
            done()
          })
      })

      it('should not allow to reject subscription request twice', function (done) {
        request
          .post(app.config.host + '/v1/groups/pepyatka-dev/rejectRequest/' + nonAdminContext.user.username)
          .send({ authToken: adminContext.authToken })
          .end(function (err, res) {
            res.status.should.eql(200)
            request
              .post(app.config.host + '/v1/groups/pepyatka-dev/rejectRequest/' + nonAdminContext.user.username)
              .send({ authToken: adminContext.authToken })
              .end(function (err) {
                err.should.not.be.empty
                err.status.should.eql(422)
                done()
              })
          })
      })
    })

    describe('#unsubscribeFromGroup', function () {
      it('should reject unauthenticated users', function (done) {
        request
          .post(app.config.host + '/v1/groups/pepyatka-dev/unsubscribeFromGroup/' + groupMemberContext.user.username)
          .end(function (err) {
            err.should.not.be.empty
            err.status.should.eql(401)
            done()
          })
      })

      it('should reject nonexisting group', function (done) {
        request
          .post(app.config.host + '/v1/groups/foobar/unsubscribeFromGroup/' + groupMemberContext.user.username)
          .send({ authToken: adminContext.authToken })
          .end(function (err) {
            err.should.not.be.empty
            err.status.should.eql(404)
            done()
          })
      })

      it('should reject nonexisting user', function (done) {
        request
          .post(app.config.host + '/v1/groups/pepyatka-dev/unsubscribeFromGroup/foobar')
          .send({ authToken: adminContext.authToken })
          .end(function (err) {
            err.should.not.be.empty
            err.status.should.eql(404)
            done()
          })
      })

      it('should not allow non-admins to unsubscribe user from group', function (done) {
        request
          .post(app.config.host + '/v1/groups/pepyatka-dev/unsubscribeFromGroup/' + groupMemberContext.user.username)
          .send({ authToken: groupMemberContext.authToken })
          .end(function (err) {
            err.should.not.be.empty
            err.status.should.eql(403)
            done()
          })
      })

      it('admins should be able to unsubscribe user from group', function (done) {
        request
          .post(app.config.host + '/v1/groups/pepyatka-dev/unsubscribeFromGroup/' + groupMemberContext.user.username)
          .send({
            authToken: adminContext.authToken,
            '_method': 'post'
          })
          .end(function (err, res) {
            res.status.should.eql(200)
            res.should.not.be.empty
            res.error.should.be.empty

            funcTestHelper.getTimeline('/v1/timelines/home', groupMemberContext.authToken, function (err, res) {
              res.should.not.be.empty
              res.body.should.not.be.empty
              res.body.should.have.property('timelines')
              res.body.timelines.should.have.property('name')
              res.body.timelines.name.should.eql('RiverOfNews')
              res.body.timelines.should.not.have.property('posts')
              res.body.should.not.have.property('posts')
              done()
            })
          })
      })

      it('should not allow to unsubscribe non-members from group', function (done) {
        request
          .post(app.config.host + '/v1/groups/pepyatka-dev/unsubscribeFromGroup/' + nonAdminContext.user.username)
          .send({ authToken: adminContext.authToken })
          .end(function (err) {
            err.should.not.be.empty
            err.status.should.eql(403)
            done()
          })
      })

      it('should not allow to unsubscribe admins from group', function (done) {
        request
          .post(app.config.host + '/v1/groups/pepyatka-dev/unsubscribeFromGroup/' + secondAdminContext.user.username)
          .send({ authToken: adminContext.authToken })
          .end(function (err) {
            err.should.not.be.empty
            err.status.should.eql(403)
            done()
          })
      })

      it('should not allow admins to unsubscribe theirself from group', function (done) {
        request
          .post(app.config.host + '/v1/groups/pepyatka-dev/unsubscribeFromGroup/' + adminContext.user.username)
          .send({ authToken: adminContext.authToken })
          .end(function (err) {
            err.should.not.be.empty
            err.status.should.eql(403)
            done()
          })
      })
    })


    describe('#unsubscribe', function () {
      it('should not allow admins to unsubscribe from group', function (done) {
        request
          .post(app.config.host + '/v1/users/pepyatka-dev/unsubscribe')
          .send({ authToken: adminContext.authToken })
          .end(function (err) {
            err.should.not.be.empty
            err.status.should.eql(403)

            request
              .post(app.config.host + '/v1/users/pepyatka-dev/unsubscribe')
              .send({ authToken: secondAdminContext.authToken })
              .end(function (err) {
                err.should.not.be.empty
                err.status.should.eql(403)
                done()
              })
          })
      })

      it('should allow group members to unsubscribe from group', function (done) {
        request
          .post(app.config.host + '/v1/users/pepyatka-dev/unsubscribe')
          .send({ authToken: groupMemberContext.authToken })
          .end(function (err, res) {
            res.should.not.be.empty
            res.status.should.eql(200)
            done()
          })
      })
    })

    describe('v2/managedGroups', function () {
      it('should reject unauthenticated users', function (done) {
        request
          .get(app.config.host + '/v2/managedGroups')
          .end(function (err) {
            err.should.not.be.empty
            err.status.should.eql(401)
            done()
          })
      })

      it('should return empty array for non-members', function (done) {
        request
          .get(app.config.host + '/v2/managedGroups')
          .send({ authToken: nonAdminContext.authToken })
          .end(function (err, res) {
            res.status.should.eql(200)
            res.body.length.should.eql(0)
            done()
          })
      })

      it('should return empty array for non-admins', function (done) {
        request
          .get(app.config.host + '/v2/managedGroups')
          .send({ authToken: groupMemberContext.authToken })
          .end(function (err, res) {
            res.status.should.eql(200)
            res.body.length.should.eql(0)
            done()
          })
      })

      it('should return requests array for admins', function (done) {
        request
          .get(app.config.host + '/v2/managedGroups')
          .query({ authToken: adminContext.authToken })
          .end(function (err, res) {
            res.should.not.be.empty
            res.body.should.not.be.empty
            res.body.length.should.eql(1)
            res.body[0].should.have.property('id')
            res.body[0].id.should.eql(group.id)
            res.body[0].should.have.property('requests')
            res.body[0].requests.length.should.eql(1)
            res.body[0].requests[0].should.have.property('id')
            res.body[0].requests[0].id.should.eql(nonAdminContext.user.id)
            res.body[0].requests[0].should.have.property('username')
            res.body[0].requests[0].username.should.eql(nonAdminContext.user.username)
            done()
          })

      })

      it('requests array should match managed groups', function (done) {
        let group3

        request
          .post(app.config.host + '/v1/groups')
          .send({
            group: { username: 'pepyatka-dev-2', screenName: 'Pepyatka Developers 2', isPrivate: '1' },
            authToken: adminContext.authToken
          })
          .end(function (err, res) {
            res.status.should.eql(200)


            request
              .post(app.config.host + '/v1/groups/pepyatka-dev-2/sendRequest')
              .send({
                authToken: groupMemberContext.authToken,
                '_method': 'post'
              })
              .end(function (err, res) {
                res.status.should.eql(200)


                request
                  .post(app.config.host + '/v1/groups')
                  .send({
                    group: { username: 'pepyatka-dev-3', screenName: 'Pepyatka Developers 3', isPrivate: '1' },
                    authToken: nonAdminContext.authToken
                  })
                  .end(function (err, res) {
                    group3 = res.body.groups
                    res.status.should.eql(200)


                    request
                      .get(app.config.host + '/v2/managedGroups')
                      .query({ authToken: adminContext.authToken })
                      .end(function (err, res) {
                        res.should.not.be.empty
                        res.body.should.not.be.empty
                        res.body.length.should.eql(2)
                        res.body[0].requests.length.should.eql(1)
                        res.body[1].requests.length.should.eql(1)


                        request
                          .get(app.config.host + '/v2/managedGroups')
                          .query({ authToken: secondAdminContext.authToken })
                          .end(function (err, res) {
                            res.should.not.be.empty
                            res.body.should.not.be.empty
                            res.body.length.should.eql(1)
                            res.body[0].id.should.eql(group.id)
                            res.body[0].requests.length.should.eql(1)


                            request
                              .get(app.config.host + '/v2/managedGroups')
                              .query({ authToken: nonAdminContext.authToken })
                              .end(function (err, res) {
                                res.should.not.be.empty
                                res.body.should.not.be.empty
                                res.body.length.should.eql(1)
                                res.body[0].should.have.property('id')
                                res.body[0].id.should.eql(group3.id)
                                res.body[0].should.have.property('requests')
                                res.body[0].requests.length.should.eql(0)


                                request
                                  .get(app.config.host + '/v2/managedGroups')
                                  .query({ authToken: groupMemberContext.authToken })
                                  .end(function (err, res) {
                                    res.should.not.be.empty
                                    res.body.should.be.empty
                                    res.body.length.should.eql(0)
                                    done()
                                  })
                              })
                          })
                      })
                  })
              })
          })
      })
    })

    describe('#whoami:pendingGroupRequests', function () {
      it('pendingGroupRequests should match managed groups', async () => {
        const verifyUsersPendingGroupRequests = async (context, shouldHave) => {
          const response = await funcTestHelper.whoami(context.authToken)
          response.status.should.eql(200)

          const data = await response.json()
          data.should.have.deep.property('users.pendingGroupRequests')
          data.users.pendingGroupRequests.should.eql(shouldHave)
        }

        const contexts = [
          { context: adminContext, shouldHave: true },
          { context: secondAdminContext, shouldHave: true },
          { context: groupMemberContext, shouldHave: false },
          { context: nonAdminContext, shouldHave: false }
        ]

        for (const { context, shouldHave } of contexts) {
          await verifyUsersPendingGroupRequests(context, shouldHave)
        }
      })
    })
  })

  describe('subscribers', function () {
    let adminContext = {}
      , plutoContext = {}
      , marsContext = {}
      , group

    beforeEach(funcTestHelper.createUserCtx(adminContext, 'Luna', 'password'))
    beforeEach(funcTestHelper.createUserCtx(marsContext, 'Mars', 'wordpass'))
    beforeEach(funcTestHelper.createUserCtx(plutoContext, 'Pluto', 'wordpass'))

    beforeEach(async () => {
      const response = await funcTestHelper.createGroupAsync(adminContext, 'pepyatka-dev', 'Pepyatka Developers')
      group = response.group

      await funcTestHelper.subscribeToAsync(plutoContext, group)

      await funcTestHelper.groupToPrivate(group, adminContext)

      await funcTestHelper.createAndReturnPostToFeed(group, adminContext, 'Post body')
    })

    it('anonymous users should have no access to private group subscribers', async function(done) {
      const groupFeedViewedByAnonymous = await funcTestHelper.getUserFeed(group)
      groupFeedViewedByAnonymous.timelines.should.not.have.property('subscribers')
      groupFeedViewedByAnonymous.should.not.have.property('subscribers')
      groupFeedViewedByAnonymous.should.not.have.property('admins')

      const groupLikesFeedViewedByAnonymous = await funcTestHelper.getUserLikesFeed(group)
      groupLikesFeedViewedByAnonymous.timelines.should.not.have.property('subscribers')
      groupLikesFeedViewedByAnonymous.should.not.have.property('subscribers')
      groupLikesFeedViewedByAnonymous.should.not.have.property('admins')

      const groupCommentsFeedViewedByAnonymous = await funcTestHelper.getUserCommentsFeed(group)
      groupCommentsFeedViewedByAnonymous.timelines.should.not.have.property('subscribers')
      groupCommentsFeedViewedByAnonymous.should.not.have.property('subscribers')
      groupCommentsFeedViewedByAnonymous.should.not.have.property('admins')

      done()
    })

    it('non-members of group should have no access to private group subscribers', async function(done) {
      const groupFeedViewedByMars = await funcTestHelper.getUserFeed(group, marsContext)
      groupFeedViewedByMars.timelines.should.not.have.property('subscribers')
      groupFeedViewedByMars.should.not.have.property('subscribers')
      groupFeedViewedByMars.should.not.have.property('admins')

      const groupLikesFeedViewedByMars = await funcTestHelper.getUserLikesFeed(group, marsContext)
      groupLikesFeedViewedByMars.timelines.should.not.have.property('subscribers')
      groupLikesFeedViewedByMars.should.not.have.property('subscribers')
      groupLikesFeedViewedByMars.should.not.have.property('admins')

      const groupCommentsFeedViewedByMars = await funcTestHelper.getUserCommentsFeed(group, marsContext)
      groupCommentsFeedViewedByMars.timelines.should.not.have.property('subscribers')
      groupCommentsFeedViewedByMars.should.not.have.property('subscribers')
      groupCommentsFeedViewedByMars.should.not.have.property('admins')

      done()
    })

    it('group members should have access to private group subscribers', async function(done) {
      const groupFeedViewedByPluto = await funcTestHelper.getUserFeed(group, plutoContext)
      groupFeedViewedByPluto.timelines.should.have.property('subscribers')
      groupFeedViewedByPluto.should.have.property('subscribers')
      groupFeedViewedByPluto.should.have.property('admins')

      const groupLikesFeedViewedByPluto = await funcTestHelper.getUserLikesFeed(group, plutoContext)
      groupLikesFeedViewedByPluto.timelines.should.have.property('subscribers')
      groupLikesFeedViewedByPluto.should.have.property('subscribers')
      groupLikesFeedViewedByPluto.should.have.property('admins')

      const groupCommentsFeedViewedByPluto = await funcTestHelper.getUserCommentsFeed(group, plutoContext)
      groupCommentsFeedViewedByPluto.timelines.should.have.property('subscribers')
      groupCommentsFeedViewedByPluto.should.have.property('subscribers')
      groupCommentsFeedViewedByPluto.should.have.property('admins')

      done()
    })
  })

  describe('Posting to restricted group', function () {
    var adminContext = {}
      , nonAdminContext = {}
      , nonMemberContext = {}

    beforeEach(funcTestHelper.createUserCtx(adminContext, 'Luna', 'password'))
    beforeEach(funcTestHelper.createUserCtx(nonAdminContext, 'yole', 'wordpass'))
    beforeEach(funcTestHelper.createUserCtx(nonMemberContext, 'Pluto', 'wordpass'))

    beforeEach(function (done) {
      request
        .post(app.config.host + '/v1/groups')
        .send({
          group: { username: 'pepyatka-dev', screenName: 'Pepyatka Developers', isPrivate: '1', isRestricted: '1' },
          authToken: adminContext.authToken
        })
        .end(function () {
          request
            .post(app.config.host + '/v1/groups')
            .send({
              group: { username: 'pepyatka-dev-2', screenName: 'Pepyatka Developers 2', isPrivate: '1', isRestricted: '0' },
              authToken: adminContext.authToken
            })
            .end(function () {
              request
                .post(app.config.host + '/v1/groups')
                .send({
                  group: { username: 'pepyatka-dev-3', screenName: 'Pepyatka Developers 3', isPrivate: '0', isRestricted: '1' },
                  authToken: adminContext.authToken
                })
                .end(function () {
                  request
                    .post(app.config.host + '/v1/groups/pepyatka-dev/sendRequest')
                    .send({
                      authToken: nonAdminContext.authToken,
                      '_method': 'post'
                    })
                    .end(function (err, res) {
                      res.status.should.eql(200)

                      request
                        .post(app.config.host + '/v1/groups/pepyatka-dev-2/sendRequest')
                        .send({
                          authToken: nonAdminContext.authToken,
                          '_method': 'post'
                        })
                        .end(function (err, res) {
                          res.status.should.eql(200)

                          request
                            .post(app.config.host + '/v1/users/pepyatka-dev-3/subscribe')
                            .send({
                              authToken: nonAdminContext.authToken,
                              '_method': 'post'
                            })
                            .end(function (err, res) {
                              res.status.should.eql(200)

                              request
                                .post(app.config.host + '/v1/groups/pepyatka-dev/acceptRequest/' + nonAdminContext.user.username)
                                .send({
                                  authToken: adminContext.authToken,
                                  '_method': 'post'
                                })
                                .end(function (err, res) {
                                  res.status.should.eql(200)

                                  request
                                    .post(app.config.host + '/v1/groups/pepyatka-dev-2/acceptRequest/' + nonAdminContext.user.username)
                                    .send({
                                      authToken: adminContext.authToken,
                                      '_method': 'post'
                                    })
                                    .end(function (err, res) {
                                      res.status.should.eql(200)
                                      done()
                                    })
                                })
                            })
                        })
                    })
                })
            })
        })
    })

    it('should allow only admins to post to private restricted group', function (done) {
      request
        .post(app.config.host + '/v1/posts')
        .send({ post: { body: 'Post body' }, meta: { feeds: 'pepyatka-dev' }, authToken: adminContext.authToken })
        .end(function (err, res) {
          res.status.should.eql(200)

          request
            .post(app.config.host + '/v1/posts')
            .send({ post: { body: 'Post body' }, meta: { feeds: 'pepyatka-dev' }, authToken: nonAdminContext.authToken })
            .end(function (err) {
              err.should.not.be.empty
              err.status.should.eql(403)

              request
                .post(app.config.host + '/v1/posts')
                .send({ post: { body: 'Post body' }, meta: { feeds: 'pepyatka-dev' }, authToken: nonMemberContext.authToken })
                .end(function (err) {
                  err.should.not.be.empty
                  err.status.should.eql(403)
                  done()
                })
            })
        })
    })

    it('should allow all members to post to private non-restricted group', function (done) {
      request
        .post(app.config.host + '/v1/posts')
        .send({ post: { body: 'Post body' }, meta: { feeds: 'pepyatka-dev-2' }, authToken: adminContext.authToken })
        .end(function (err, res) {
          res.status.should.eql(200)

          request
            .post(app.config.host + '/v1/posts')
            .send({ post: { body: 'Post body' }, meta: { feeds: 'pepyatka-dev-2' }, authToken: nonAdminContext.authToken })
            .end(function (err, res) {
              res.should.not.be.empty
              res.status.should.eql(200)

              request
                .post(app.config.host + '/v1/posts')
                .send({ post: { body: 'Post body' }, meta: { feeds: 'pepyatka-dev-2' }, authToken: nonMemberContext.authToken })
                .end(function (err) {
                  err.should.not.be.empty
                  err.status.should.eql(403)
                  done()
                })
            })
        })
    })

    it('should allow only admins to post to public restricted group', function (done) {
      request
        .post(app.config.host + '/v1/posts')
        .send({ post: { body: 'Post body' }, meta: { feeds: 'pepyatka-dev-3' }, authToken: adminContext.authToken })
        .end(function (err, res) {
          res.status.should.eql(200)

          request
            .post(app.config.host + '/v1/posts')
            .send({ post: { body: 'Post body' }, meta: { feeds: 'pepyatka-dev-3' }, authToken: nonAdminContext.authToken })
            .end(function (err) {
              err.should.not.be.empty
              err.status.should.eql(403)

              request
                .post(app.config.host + '/v1/posts')
                .send({ post: { body: 'Post body' }, meta: { feeds: 'pepyatka-dev-3' }, authToken: nonMemberContext.authToken })
                .end(function (err) {
                  err.should.not.be.empty
                  err.status.should.eql(403)
                  done()
                })
            })
        })
    })
  })
})
