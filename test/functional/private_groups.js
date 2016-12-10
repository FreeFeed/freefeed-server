/* eslint-env node, mocha */
/* global $pg_database */
import request from 'superagent'
import knexCleaner from 'knex-cleaner'

import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub } from '../../app/models'
import * as funcTestHelper from './functional_test_helper'


describe('PrivateGroups', () => {
  let app

  before(async () => {
    app = await getSingleton()
    PubSub.setPublisher(new DummyPublisher())
  })

  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  describe('#create()', () => {
    let context = {}

    beforeEach(async () => {
      context = await funcTestHelper.createUserAsync('Luna', 'password')
    })

    it('should create a public not-restricted group by default', (done) => {
      const userName = 'pepyatka-dev';
      const screenName = 'Pepyatka Developers';
      request
        .post(`${app.context.config.host}/v1/groups`)
        .send({
          group:     { username: userName, screenName },
          authToken: context.authToken
        })
        .end((err, res) => {
          res.body.should.not.be.empty
          res.body.should.have.property('groups')
          res.body.groups.should.have.property('username')
          res.body.groups.should.have.property('screenName')
          res.body.groups.username.should.eql(userName)
          res.body.groups.screenName.should.eql(screenName)
          res.body.groups.isPrivate.should.eql('0')
          res.body.groups.isProtected.should.eql('0')
          res.body.groups.isRestricted.should.eql('0')
          done()
        })
    })

    it('should create a protected group', (done) => {
      const userName = 'pepyatka-dev';
      const screenName = 'Pepyatka Developers';
      request
        .post(`${app.context.config.host}/v1/groups`)
        .send({
          group:     { username: userName, screenName, isProtected: '1' },
          authToken: context.authToken
        })
        .end((err, res) => {
          res.body.should.not.be.empty
          res.body.should.have.property('groups')
          res.body.groups.isPrivate.should.eql('0')
          res.body.groups.isProtected.should.eql('1')
          res.body.groups.isRestricted.should.eql('0')
          done()
        })
    })

    it('should create a private group', (done) => {
      const userName = 'pepyatka-dev';
      const screenName = 'Pepyatka Developers';
      request
        .post(`${app.context.config.host}/v1/groups`)
        .send({
          group:     { username: userName, screenName, isPrivate: '1' },
          authToken: context.authToken
        })
        .end((err, res) => {
          res.body.should.not.be.empty
          res.body.should.have.property('groups')
          res.body.groups.isPrivate.should.eql('1')
          res.body.groups.isProtected.should.eql('1')
          res.body.groups.isRestricted.should.eql('0')
          done()
        })
    })

    it('should create a public restricted group', (done) => {
      const userName = 'pepyatka-dev';
      const screenName = 'Pepyatka Developers';
      request
        .post(`${app.context.config.host}/v1/groups`)
        .send({
          group:     { username: userName, screenName, isRestricted: '1' },
          authToken: context.authToken
        })
        .end((err, res) => {
          res.body.should.not.be.empty
          res.body.should.have.property('groups')
          res.body.groups.isPrivate.should.eql('0')
          res.body.groups.isProtected.should.eql('0')
          res.body.groups.isRestricted.should.eql('1')
          done()
        })
    })

    it('should create a protected restricted group', (done) => {
      const userName = 'pepyatka-dev';
      const screenName = 'Pepyatka Developers';
      request
        .post(`${app.context.config.host}/v1/groups`)
        .send({
          group:     { username: userName, screenName, isProtected: '1', isRestricted: '1' },
          authToken: context.authToken
        })
        .end((err, res) => {
          res.body.should.not.be.empty
          res.body.should.have.property('groups')
          res.body.groups.isPrivate.should.eql('0')
          res.body.groups.isProtected.should.eql('1')
          res.body.groups.isRestricted.should.eql('1')
          done()
        })
    })

    it('should create a private restricted group', (done) => {
      const userName = 'pepyatka-dev';
      const screenName = 'Pepyatka Developers';
      request
        .post(`${app.context.config.host}/v1/groups`)
        .send({
          group:     { username: userName, screenName, isPrivate: '1', isRestricted: '1' },
          authToken: context.authToken
        })
        .end((err, res) => {
          res.body.should.not.be.empty
          res.body.should.have.property('groups')
          res.body.groups.isPrivate.should.eql('1')
          res.body.groups.isProtected.should.eql('1')
          res.body.groups.isRestricted.should.eql('1')
          done()
        })
    })
  })

  describe('#admin', () => {
    let adminContext = {}
    let nonAdminContext = {}
    let group = {}

    beforeEach(async () => {
      [adminContext, nonAdminContext] = await Promise.all([
        funcTestHelper.createUserAsync('Luna', 'password'),
        funcTestHelper.createUserAsync('yole', 'wordpass')
      ])
      group = await funcTestHelper.createGroupAsync(adminContext, 'pepyatka-dev', 'Pepyatka Developers', true)
    })

    it('should allow an administrator of private group to add another administrator', (done) => {
      request
        .post(`${app.context.config.host}/v1/groups/${group.username}/subscribers/${nonAdminContext.user.username}/admin`)
        .send({ authToken: adminContext.authToken })
        .end((err, res) => {
          res.status.should.eql(200)
          done()
        })
    })
  })

  describe('#update', () => {
    const context = {}
    let group

    beforeEach(funcTestHelper.createUserCtx(context, 'Luna', 'password'))

    beforeEach((done) => {
      request
        .post(`${app.context.config.host}/v1/groups`)
        .send({
          group:     { username: 'pepyatka-dev', screenName: 'Pepyatka Developers', isPrivate: '1' },
          authToken: context.authToken
        })
        .end((err, res) => {
          group = res.body.groups
          done()
        })
    })

    it('should update private group settings', (done) => {
      const screenName = 'mokum-dev'
      const description = 'Mokum Developers'

      request
        .post(`${app.context.config.host}/v1/users/${group.id}`)
        .send({
          authToken: context.authToken,
          user:      { screenName, description },
          '_method': 'put'
        })
        .end((err, res) => {
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
          res.body.groups.should.have.property('isProtected')
          res.body.groups.isProtected.should.eql('1')
          res.body.groups.should.have.property('isRestricted')
          res.body.groups.isRestricted.should.eql('0')
          done()
        })
    })

    it('should update group isRestricted', (done) => {
      request
        .post(`${app.context.config.host}/v1/users/${group.id}`)
        .send({
          authToken: context.authToken,
          user:      { isRestricted: '1' },
          '_method': 'put'
        })
        .end((err, res) => {
          res.should.not.be.empty
          res.body.should.not.be.empty
          res.body.should.have.property('groups')
          res.body.groups.should.have.property('id')
          res.body.groups.should.have.property('isPrivate')
          res.body.groups.isPrivate.should.eql('1')
          res.body.groups.should.have.property('isProtected')
          res.body.groups.isProtected.should.eql('1')
          res.body.groups.should.have.property('isRestricted')
          res.body.groups.isRestricted.should.eql('1')
          done()
        })
    })

    it('should update group isPrivate', (done) => {
      request
        .post(`${app.context.config.host}/v1/users/${group.id}`)
        .send({
          authToken: context.authToken,
          user:      { isPrivate: '0' },
          '_method': 'put'
        })
        .end((err, res) => {
          res.should.not.be.empty
          res.body.should.not.be.empty
          res.body.should.have.property('groups')
          res.body.groups.should.have.property('id')
          res.body.groups.should.have.property('isPrivate')
          res.body.groups.isPrivate.should.eql('0')
          res.body.groups.should.have.property('isProtected')
          res.body.groups.isProtected.should.eql('0')
          res.body.groups.should.have.property('isRestricted')
          res.body.groups.isRestricted.should.eql('0')
          done()
        })
    })

    it('should update group isProtected', (done) => {
      request
        .post(`${app.context.config.host}/v1/users/${group.id}`)
        .send({
          authToken: context.authToken,
          user:      { isPrivate: '0', isProtected: '1' },
          '_method': 'put'
        })
        .end((err, res) => {
          res.should.not.be.empty
          res.body.should.not.be.empty
          res.body.should.have.property('groups')
          res.body.groups.should.have.property('id')
          res.body.groups.should.have.property('isPrivate')
          res.body.groups.isPrivate.should.eql('0')
          res.body.groups.should.have.property('isProtected')
          res.body.groups.isProtected.should.eql('1')
          res.body.groups.should.have.property('isRestricted')
          res.body.groups.isRestricted.should.eql('0')
          done()
        })
    })
  })

  describe('#unadmin', () => {
    const adminContext = {}
    const nonAdminContext = {}

    beforeEach(funcTestHelper.createUserCtx(adminContext, 'Luna', 'password'))
    beforeEach(funcTestHelper.createUserCtx(nonAdminContext, 'yole', 'wordpass'))

    beforeEach((done) => {
      request
        .post(`${app.context.config.host}/v1/groups`)
        .send({
          group:     { username: 'pepyatka-dev', screenName: 'Pepyatka Developers', isPrivate: '1' },
          authToken: adminContext.authToken
        })
        .end(() => {
          done()
        })
    })

    beforeEach((done) => {
      request
        .post(`${app.context.config.host}/v1/groups/pepyatka-dev/subscribers/yole/admin`)
        .send({ authToken: adminContext.authToken })
        .end(() => {
          done()
        })
    })

    it('should allow an administrator of private group to remove another administrator', (done) => {
      request
        .post(`${app.context.config.host}/v1/groups/pepyatka-dev/subscribers/yole/unadmin`)
        .send({ authToken: adminContext.authToken })
        .end((err, res) => {
          res.status.should.eql(200)
          done()
        })
    })
  })

  describe('#sendRequest', () => {
    let adminContext = {}
    let nonAdminContext = {}
    let group

    beforeEach(async () => {
      [adminContext, nonAdminContext] = await Promise.all([
        funcTestHelper.createUserAsync('Luna', 'password'),
        funcTestHelper.createUserAsync('yole', 'wordpass')
      ])

      const response = await funcTestHelper.createGroupAsync(adminContext, 'pepyatka-dev', 'Pepyatka Developers', true)
      group = response.group
    })

    it('should reject unauthenticated users', (done) => {
      request
        .post(`${app.context.config.host}/v1/groups/${group.username}/sendRequest`)
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })

    it('should reject nonexisting group', (done) => {
      request
        .post(`${app.context.config.host}/v1/groups/foobar/sendRequest`)
        .send({ authToken: nonAdminContext.authToken })
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(404)
          done()
        })
    })

    it('should allow user to send subscription request to private group', (done) => {
      request
        .post(`${app.context.config.host}/v1/groups/pepyatka-dev/sendRequest`)
        .send({ authToken: nonAdminContext.authToken })
        .end((err, res) => {
          res.status.should.eql(200)
          request
            .get(`${app.context.config.host}/v1/users/whoami`)
            .query({ authToken: adminContext.authToken })
            .end((err, res) => {
              res.should.not.be.empty
              res.body.should.not.be.empty
              res.body.should.have.property('users')
              res.body.users.should.have.property('pendingGroupRequests')
              res.body.users.pendingGroupRequests.should.be.true
              done()
            })
        })
    })

    it('should not allow user to send subscription request to private group twice', (done) => {
      request
        .post(`${app.context.config.host}/v1/groups/pepyatka-dev/sendRequest`)
        .send({ authToken: nonAdminContext.authToken })
        .end((err, res) => {
          res.status.should.eql(200)
          request
            .post(`${app.context.config.host}/v1/groups/pepyatka-dev/sendRequest`)
            .send({ authToken: nonAdminContext.authToken })
            .end((err, res) => {
              res.status.should.eql(403)
              done()
            })
        })
    })

    it('should not allow user to send subscription request to public group', (done) => {
      request
        .post(`${app.context.config.host}/v1/users/${group.id}`)
        .send({
          authToken: adminContext.authToken,
          user:      { isPrivate: '0' },
          '_method': 'put'
        })
        .end(() => {
          request
            .post(`${app.context.config.host}/v1/groups/pepyatka-dev/sendRequest`)
            .send({ authToken: nonAdminContext.authToken })
            .end((err, res) => {
              res.status.should.eql(500)
              done()
            })
        })
    })

    it('should not allow subscriber user to send subscription request to private group', (done) => {
      request
        .post(`${app.context.config.host}/v1/groups/pepyatka-dev/sendRequest`)
        .send({ authToken: nonAdminContext.authToken })
        .end(() => {
          request
            .post(`${app.context.config.host}/v1/groups/pepyatka-dev/acceptRequest${nonAdminContext.user.username}`)
            .send({
              authToken: adminContext.authToken,
              '_method': 'post'
            })
            .end(() => {
              request
                .post(`${app.context.config.host}/v1/groups/pepyatka-dev/sendRequest`)
                .send({ authToken: nonAdminContext.authToken })
                .end((err, res) => {
                  res.status.should.eql(403)
                  done()
                })
            })
        })
    })
  })

  describe('subscription requests and membership management', () => {
    let adminContext = {}
    let secondAdminContext = {}
    let nonAdminContext = {}
    let groupMemberContext = {}
    let group

    beforeEach(async () => {
      [adminContext, secondAdminContext, nonAdminContext, groupMemberContext] = await Promise.all([
        funcTestHelper.createUserAsync('Luna', 'password'),
        funcTestHelper.createUserAsync('Neptune', 'password'),
        funcTestHelper.createUserAsync('yole', 'wordpass'),
        funcTestHelper.createUserAsync('Pluto', 'wordpass')
      ])

      const response = await funcTestHelper.createGroupAsync(adminContext, 'pepyatka-dev', 'Pepyatka Developers')
      group = response.group

      await Promise.all([
        funcTestHelper.subscribeToAsync(secondAdminContext, group),
        funcTestHelper.subscribeToAsync(groupMemberContext, group)
      ]);

      await funcTestHelper.promoteToAdmin(group, adminContext, secondAdminContext)
      await funcTestHelper.groupToPrivate(group, adminContext)

      await funcTestHelper.createAndReturnPostToFeed(group, adminContext, 'Post body')

      await funcTestHelper.sendRequestToJoinGroup(nonAdminContext, group)
    })

    describe('#acceptRequest', () => {
      it('should reject unauthenticated users', (done) => {
        request
          .post(`${app.context.config.host}/v1/groups/pepyatka-dev/acceptRequest/${nonAdminContext.user.username}`)
          .end((err) => {
            err.should.not.be.empty
            err.status.should.eql(401)
            done()
          })
      })

      it('should reject nonexisting group', (done) => {
        request
          .post(`${app.context.config.host}/v1/groups/foobar/acceptRequest/${nonAdminContext.user.username}`)
          .send({ authToken: adminContext.authToken })
          .end((err) => {
            err.should.not.be.empty
            err.status.should.eql(404)
            done()
          })
      })

      it('should reject nonexisting user', (done) => {
        request
          .post(`${app.context.config.host}/v1/groups/pepyatka-dev/acceptRequest/foobar`)
          .send({ authToken: adminContext.authToken })
          .end((err) => {
            err.should.not.be.empty
            err.status.should.eql(404)
            done()
          })
      })

      it('should not allow non-admins to accept subscription request', (done) => {
        request
          .post(`${app.context.config.host}/v1/groups/pepyatka-dev/acceptRequest/${nonAdminContext.user.username}`)
          .send({ authToken: groupMemberContext.authToken })
          .end((err) => {
            err.should.not.be.empty
            err.status.should.eql(403)
            done()
          })
      })

      it('should be able to accept subscription request', (done) => {
        request
          .post(`${app.context.config.host}/v1/groups/pepyatka-dev/acceptRequest/${nonAdminContext.user.username}`)
          .send({
            authToken: adminContext.authToken,
            '_method': 'post'
          })
          .end((err, res) => {
            res.status.should.eql(200)
            res.should.not.be.empty
            res.error.should.be.empty

            request
              .get(`${app.context.config.host}/v1/users/whoami`)
              .query({ authToken: adminContext.authToken })
              .end((err, res) => {
                res.should.not.be.empty
                res.body.should.not.be.empty
                res.body.should.have.property('users')
                res.body.users.should.have.property('pendingGroupRequests')
                res.body.users.pendingGroupRequests.should.be.false


                funcTestHelper.getTimeline('/v1/timelines/home', nonAdminContext.authToken, (err, res) => {
                  res.should.not.be.empty
                  res.body.should.not.be.empty
                  res.body.should.have.property('timelines')
                  res.body.timelines.should.have.property('name')
                  res.body.timelines.name.should.eql('RiverOfNews')
                  res.body.timelines.should.have.property('posts')
                  res.body.timelines.posts.length.should.eql(1)
                  res.body.should.have.property('posts')
                  res.body.posts.length.should.eql(1)
                  const post = res.body.posts[0]
                  post.body.should.eql('Post body')
                  done()
                })
              })
          })
      })


      it('should not allow to accept non-existent subscription request', (done) => {
        request
          .post(`${app.context.config.host}/v1/groups/pepyatka-dev/acceptRequest/${groupMemberContext.user.username}`)
          .send({ authToken: adminContext.authToken })
          .end((err) => {
            err.should.not.be.empty
            err.status.should.eql(500)
            done()
          })
      })

      it('should not allow to accept subscription request twice', (done) => {
        request
          .post(`${app.context.config.host}/v1/groups/pepyatka-dev/acceptRequest/${nonAdminContext.user.username}`)
          .send({ authToken: adminContext.authToken })
          .end((err, res) => {
            res.status.should.eql(200)
            request
              .post(`${app.context.config.host}/v1/groups/pepyatka-dev/acceptRequest/${nonAdminContext.user.username}`)
              .send({ authToken: adminContext.authToken })
              .end((err) => {
                err.should.not.be.empty
                err.status.should.eql(500)
                done()
              })
          })
      })
    })

    describe('#rejectRequest', () => {
      it('should reject unauthenticated users', (done) => {
        request
          .post(`${app.context.config.host}/v1/groups/pepyatka-dev/rejectRequest/${nonAdminContext.user.username}`)
          .end((err) => {
            err.should.not.be.empty
            err.status.should.eql(401)
            done()
          })
      })

      it('should reject nonexisting group', (done) => {
        request
          .post(`${app.context.config.host}/v1/groups/foobar/rejectRequest/${nonAdminContext.user.username}`)
          .send({ authToken: adminContext.authToken })
          .end((err) => {
            err.should.not.be.empty
            err.status.should.eql(404)
            done()
          })
      })

      it('should reject nonexisting user', (done) => {
        request
          .post(`${app.context.config.host}/v1/groups/pepyatka-dev/rejectRequest/foobar`)
          .send({ authToken: adminContext.authToken })
          .end((err) => {
            err.should.not.be.empty
            err.status.should.eql(404)
            done()
          })
      })

      it('should not allow non-admins to reject subscription request', (done) => {
        request
          .post(`${app.context.config.host}/v1/groups/pepyatka-dev/rejectRequest/${nonAdminContext.user.username}`)
          .send({ authToken: groupMemberContext.authToken })
          .end((err) => {
            err.should.not.be.empty
            err.status.should.eql(403)
            done()
          })
      })

      it('should be able to reject subscription request', (done) => {
        request
          .post(`${app.context.config.host}/v1/groups/pepyatka-dev/rejectRequest/${nonAdminContext.user.username}`)
          .send({
            authToken: adminContext.authToken,
            '_method': 'post'
          })
          .end((err, res) => {
            res.status.should.eql(200)
            res.should.not.be.empty
            res.error.should.be.empty

            request
              .get(`${app.context.config.host}/v1/users/whoami`)
              .query({ authToken: adminContext.authToken })
              .end((err, res) => {
                res.should.not.be.empty
                res.body.should.not.be.empty
                res.body.should.have.property('users')
                res.body.users.should.have.property('pendingGroupRequests')
                res.body.users.pendingGroupRequests.should.be.false


                funcTestHelper.getTimeline('/v1/timelines/home', nonAdminContext.authToken, (err, res) => {
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


      it('should not allow to reject non-existent subscription request', (done) => {
        request
          .post(`${app.context.config.host}/v1/groups/pepyatka-dev/rejectRequest/${groupMemberContext.user.username}`)
          .send({ authToken: adminContext.authToken })
          .end((err) => {
            err.should.not.be.empty
            err.status.should.eql(500)
            done()
          })
      })

      it('should not allow to reject subscription request twice', (done) => {
        request
          .post(`${app.context.config.host}/v1/groups/pepyatka-dev/rejectRequest/${nonAdminContext.user.username}`)
          .send({ authToken: adminContext.authToken })
          .end((err, res) => {
            res.status.should.eql(200)
            request
              .post(`${app.context.config.host}/v1/groups/pepyatka-dev/rejectRequest/${nonAdminContext.user.username}`)
              .send({ authToken: adminContext.authToken })
              .end((err) => {
                err.should.not.be.empty
                err.status.should.eql(500)
                done()
              })
          })
      })
    })

    describe('#unsubscribeFromGroup', () => {
      it('should reject unauthenticated users', (done) => {
        request
          .post(`${app.context.config.host}/v1/groups/pepyatka-dev/unsubscribeFromGroup/${groupMemberContext.user.username}`)
          .end((err) => {
            err.should.not.be.empty
            err.status.should.eql(401)
            done()
          })
      })

      it('should reject nonexisting group', (done) => {
        request
          .post(`${app.context.config.host}/v1/groups/foobar/unsubscribeFromGroup/${groupMemberContext.user.username}`)
          .send({ authToken: adminContext.authToken })
          .end((err) => {
            err.should.not.be.empty
            err.status.should.eql(404)
            done()
          })
      })

      it('should reject nonexisting user', (done) => {
        request
          .post(`${app.context.config.host}/v1/groups/pepyatka-dev/unsubscribeFromGroup/foobar`)
          .send({ authToken: adminContext.authToken })
          .end((err) => {
            err.should.not.be.empty
            err.status.should.eql(404)
            done()
          })
      })

      it('should not allow non-admins to unsubscribe user from group', (done) => {
        request
          .post(`${app.context.config.host}/v1/groups/pepyatka-dev/unsubscribeFromGroup/${groupMemberContext.user.username}`)
          .send({ authToken: groupMemberContext.authToken })
          .end((err) => {
            err.should.not.be.empty
            err.status.should.eql(403)
            done()
          })
      })

      it('admins should be able to unsubscribe user from group', (done) => {
        request
          .post(`${app.context.config.host}/v1/groups/pepyatka-dev/unsubscribeFromGroup/${groupMemberContext.user.username}`)
          .send({
            authToken: adminContext.authToken,
            '_method': 'post'
          })
          .end((err, res) => {
            res.status.should.eql(200)
            res.should.not.be.empty
            res.error.should.be.empty

            funcTestHelper.getTimeline('/v1/timelines/home', groupMemberContext.authToken, (err, res) => {
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

      it('should not allow to unsubscribe non-members from group', (done) => {
        request
          .post(`${app.context.config.host}/v1/groups/pepyatka-dev/unsubscribeFromGroup/${nonAdminContext.user.username}`)
          .send({ authToken: adminContext.authToken })
          .end((err) => {
            err.should.not.be.empty
            err.status.should.eql(403)
            done()
          })
      })

      it('should not allow to unsubscribe admins from group', (done) => {
        request
          .post(`${app.context.config.host}/v1/groups/pepyatka-dev/unsubscribeFromGroup/${secondAdminContext.user.username}`)
          .send({ authToken: adminContext.authToken })
          .end((err) => {
            err.should.not.be.empty
            err.status.should.eql(403)
            done()
          })
      })

      it('should not allow admins to unsubscribe theirself from group', (done) => {
        request
          .post(`${app.context.config.host}/v1/groups/pepyatka-dev/unsubscribeFromGroup/${adminContext.user.username}`)
          .send({ authToken: adminContext.authToken })
          .end((err) => {
            err.should.not.be.empty
            err.status.should.eql(403)
            done()
          })
      })
    })


    describe('#unsubscribe', () => {
      it('should not allow admins to unsubscribe from group', (done) => {
        request
          .post(`${app.context.config.host}/v1/users/pepyatka-dev/unsubscribe`)
          .send({ authToken: adminContext.authToken })
          .end((err) => {
            err.should.not.be.empty
            err.status.should.eql(403)

            request
              .post(`${app.context.config.host}/v1/users/pepyatka-dev/unsubscribe`)
              .send({ authToken: secondAdminContext.authToken })
              .end((err) => {
                err.should.not.be.empty
                err.status.should.eql(403)
                done()
              })
          })
      })

      it('should allow group members to unsubscribe from group', (done) => {
        request
          .post(`${app.context.config.host}/v1/users/pepyatka-dev/unsubscribe`)
          .send({ authToken: groupMemberContext.authToken })
          .end((err, res) => {
            res.should.not.be.empty
            res.status.should.eql(200)
            done()
          })
      })
    })

    describe('v2/managedGroups', () => {
      it('should reject unauthenticated users', (done) => {
        request
          .get(`${app.context.config.host}/v2/managedGroups`)
          .end((err) => {
            err.should.not.be.empty
            err.status.should.eql(401)
            done()
          })
      })

      it('should return empty array for non-members', (done) => {
        request
          .get(`${app.context.config.host}/v2/managedGroups`)
          .query({ authToken: nonAdminContext.authToken })
          .end((err, res) => {
            res.status.should.eql(200)
            res.body.length.should.eql(0)
            done()
          })
      })

      it('should return empty array for non-admins', (done) => {
        request
          .get(`${app.context.config.host}/v2/managedGroups`)
          .query({ authToken: groupMemberContext.authToken })
          .end((err, res) => {
            res.status.should.eql(200)
            res.body.length.should.eql(0)
            done()
          })
      })

      it('should return requests array for admins', (done) => {
        request
          .get(`${app.context.config.host}/v2/managedGroups`)
          .query({ authToken: adminContext.authToken })
          .end((err, res) => {
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

      it('requests array should match managed groups', (done) => {
        let group3

        request
          .post(`${app.context.config.host}/v1/groups`)
          .send({
            group:     { username: 'pepyatka-dev-2', screenName: 'Pepyatka Developers 2', isPrivate: '1' },
            authToken: adminContext.authToken
          })
          .end((err, res) => {
            res.status.should.eql(200)


            request
              .post(`${app.context.config.host}/v1/groups/pepyatka-dev-2/sendRequest`)
              .send({
                authToken: groupMemberContext.authToken,
                '_method': 'post'
              })
              .end((err, res) => {
                res.status.should.eql(200)


                request
                  .post(`${app.context.config.host}/v1/groups`)
                  .send({
                    group:     { username: 'pepyatka-dev-3', screenName: 'Pepyatka Developers 3', isPrivate: '1' },
                    authToken: nonAdminContext.authToken
                  })
                  .end((err, res) => {
                    group3 = res.body.groups
                    res.status.should.eql(200)


                    request
                      .get(`${app.context.config.host}/v2/managedGroups`)
                      .query({ authToken: adminContext.authToken })
                      .end((err, res) => {
                        res.should.not.be.empty
                        res.body.should.not.be.empty
                        res.body.length.should.eql(2)
                        res.body[0].requests.length.should.eql(1)
                        res.body[1].requests.length.should.eql(1)


                        request
                          .get(`${app.context.config.host}/v2/managedGroups`)
                          .query({ authToken: secondAdminContext.authToken })
                          .end((err, res) => {
                            res.should.not.be.empty
                            res.body.should.not.be.empty
                            res.body.length.should.eql(1)
                            res.body[0].id.should.eql(group.id)
                            res.body[0].requests.length.should.eql(1)


                            request
                              .get(`${app.context.config.host}/v2/managedGroups`)
                              .query({ authToken: nonAdminContext.authToken })
                              .end((err, res) => {
                                res.should.not.be.empty
                                res.body.should.not.be.empty
                                res.body.length.should.eql(1)
                                res.body[0].should.have.property('id')
                                res.body[0].id.should.eql(group3.id)
                                res.body[0].should.have.property('requests')
                                res.body[0].requests.length.should.eql(0)


                                request
                                  .get(`${app.context.config.host}/v2/managedGroups`)
                                  .query({ authToken: groupMemberContext.authToken })
                                  .end((err, res) => {
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

    describe('#whoami:pendingGroupRequests', () => {
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

        await Promise.all(contexts.map(
          ({ context, shouldHave }) => verifyUsersPendingGroupRequests(context, shouldHave)
        ))
      })
    })
  })

  describe('subscribers', () => {
    let adminContext = {}
    let plutoContext = {}
    let marsContext = {}
    let group

    beforeEach(async () => {
      [adminContext, marsContext, plutoContext] = await Promise.all([
        funcTestHelper.createUserAsync('Luna', 'password'),
        funcTestHelper.createUserAsync('Mars', 'wordpass'),
        funcTestHelper.createUserAsync('Pluto', 'wordpass')
      ])

      const response = await funcTestHelper.createGroupAsync(adminContext, 'pepyatka-dev', 'Pepyatka Developers')
      group = response.group

      await funcTestHelper.subscribeToAsync(plutoContext, group)

      await funcTestHelper.groupToPrivate(group, adminContext)

      await funcTestHelper.createAndReturnPostToFeed(group, adminContext, 'Post body')
    })

    it('anonymous users should have no access to private group subscribers', async () => {
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
    });

    it('non-members of group should have no access to private group subscribers', async () => {
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
    })

    it('group members should have access to private group subscribers', async () => {
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
    });
  })

  describe('Posting to restricted group', () => {
    let adminContext = {}
    let nonAdminContext = {}
    let nonMemberContext = {}

    beforeEach(async () => {
      [adminContext, nonAdminContext, nonMemberContext] = await Promise.all([
        funcTestHelper.createUserAsync('Luna', 'password'),
        funcTestHelper.createUserAsync('yole', 'wordpass'),
        funcTestHelper.createUserAsync('Pluto', 'wordpass')
      ])

      const [group1, group2, group3] = await Promise.all([
        funcTestHelper.createGroupAsync(adminContext, 'pepyatka-dev', 'Pepyatka Developers', true, true),
        funcTestHelper.createGroupAsync(adminContext, 'pepyatka-dev-2', 'Pepyatka Developers 2', true, false),
        funcTestHelper.createGroupAsync(adminContext, 'pepyatka-dev-3', 'Pepyatka Developers 3', false, true)
      ])

      await Promise.all([
        funcTestHelper.sendRequestToJoinGroup(nonAdminContext, group1),
        funcTestHelper.sendRequestToJoinGroup(nonAdminContext, group2),
        funcTestHelper.subscribeToAsync(nonAdminContext, group3)
      ])

      await Promise.all([
        funcTestHelper.acceptRequestToJoinGroup(adminContext, nonAdminContext, group1),
        funcTestHelper.acceptRequestToJoinGroup(adminContext, nonAdminContext, group2)
      ])
    })

    it('should allow only admins to post to private restricted group', (done) => {
      request
        .post(`${app.context.config.host}/v1/posts`)
        .send({ post: { body: 'Post body' }, meta: { feeds: 'pepyatka-dev' }, authToken: adminContext.authToken })
        .end((err, res) => {
          res.status.should.eql(200)

          request
            .post(`${app.context.config.host}/v1/posts`)
            .send({ post: { body: 'Post body' }, meta: { feeds: 'pepyatka-dev' }, authToken: nonAdminContext.authToken })
            .end((err) => {
              err.should.not.be.empty
              err.status.should.eql(403)

              request
                .post(`${app.context.config.host}/v1/posts`)
                .send({ post: { body: 'Post body' }, meta: { feeds: 'pepyatka-dev' }, authToken: nonMemberContext.authToken })
                .end((err) => {
                  err.should.not.be.empty
                  err.status.should.eql(403)
                  done()
                })
            })
        })
    })

    it('should allow all members to post to private non-restricted group', (done) => {
      request
        .post(`${app.context.config.host}/v1/posts`)
        .send({ post: { body: 'Post body' }, meta: { feeds: 'pepyatka-dev-2' }, authToken: adminContext.authToken })
        .end((err, res) => {
          res.status.should.eql(200)

          request
            .post(`${app.context.config.host}/v1/posts`)
            .send({ post: { body: 'Post body' }, meta: { feeds: 'pepyatka-dev-2' }, authToken: nonAdminContext.authToken })
            .end((err, res) => {
              res.should.not.be.empty
              res.status.should.eql(200)

              request
                .post(`${app.context.config.host}/v1/posts`)
                .send({ post: { body: 'Post body' }, meta: { feeds: 'pepyatka-dev-2' }, authToken: nonMemberContext.authToken })
                .end((err) => {
                  err.should.not.be.empty
                  err.status.should.eql(403)
                  done()
                })
            })
        })
    })

    it('should allow only admins to post to public restricted group', (done) => {
      request
        .post(`${app.context.config.host}/v1/posts`)
        .send({ post: { body: 'Post body' }, meta: { feeds: 'pepyatka-dev-3' }, authToken: adminContext.authToken })
        .end((err, res) => {
          res.status.should.eql(200)

          request
            .post(`${app.context.config.host}/v1/posts`)
            .send({ post: { body: 'Post body' }, meta: { feeds: 'pepyatka-dev-3' }, authToken: nonAdminContext.authToken })
            .end((err) => {
              err.should.not.be.empty
              err.status.should.eql(403)

              request
                .post(`${app.context.config.host}/v1/posts`)
                .send({ post: { body: 'Post body' }, meta: { feeds: 'pepyatka-dev-3' }, authToken: nonMemberContext.authToken })
                .end((err) => {
                  err.should.not.be.empty
                  err.status.should.eql(403)
                  done()
                })
            })
        })
    })
  })
})
