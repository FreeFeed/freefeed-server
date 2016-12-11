/* eslint-env node, mocha */
/* global $pg_database */
import request from 'superagent'
import { mkdirp } from 'mkdirp'
import knexCleaner from 'knex-cleaner'
import { promisify } from 'bluebird'

import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub } from '../../app/models'
import { load as configLoader } from '../../config/config'
import * as funcTestHelper from './functional_test_helper'


const mkdirpAsync = promisify(mkdirp);
const config = configLoader()

describe('GroupsController', () => {
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

    it('should reject unauthenticated users', (done) => {
      request
        .post(`${app.context.config.host}/v1/groups`)
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })

    it('should create a group', (done) => {
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
          done()
        })
    })

    it('should not create a group if a user with that name already exists', (done) => {
      const userName = 'Luna';
      const screenName = 'Pepyatka Developers';
      request
        .post(`${app.context.config.host}/v1/groups`)
        .send({
          group:     { username: userName, screenName },
          authToken: context.authToken
        })
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(500)
          done()
        })
    })

    it('should not create a group with slash in its name', (done) => {
      const userName = 'Lu/na';
      const screenName = 'Pepyatka Developers';
      request
        .post(`${app.context.config.host}/v1/groups`)
        .send({
          group:     { username: userName, screenName },
          authToken: context.authToken
        })
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(500)
          err.response.error.should.have.property('text')
          JSON.parse(err.response.error.text).err.should.eql('Invalid username')
          done()
        })
    })

    it('should not create a group with an empty username', (done) => {
      const userName = '';
      const screenName = '';
      request
        .post(`${app.context.config.host}/v1/groups`)
        .send({
          group:     { username: userName, screenName },
          authToken: context.authToken
        })
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(500)
          err.response.error.should.have.property('text')
          JSON.parse(err.response.error.text).err.should.eql('Invalid username')
          done()
        })
    })

    it('should add the creating user as the administrator', (done) => {
      const userName = 'pepyatka-dev';
      const screenName = 'Pepyatka Developers';
      request
        .post(`${app.context.config.host}/v1/groups`)
        .send({
          group:     { username: userName, screenName },
          authToken: context.authToken
        })
        .end(() => {
          // TODO[yole] check that the user is an administrator
          done()
        })
    })

    it('should subscribe the creating user', (done) => {
      const userName = 'pepyatka-dev';
      const screenName = 'Pepyatka Developers';
      request
        .post(`${app.context.config.host}/v1/groups`)
        .send({
          group:     { username: userName, screenName },
          authToken: context.authToken
        })
        .end((err, res) => {
          const newGroupId = res.body.groups.id
          request
            .get(`${app.context.config.host}/v1/users/Luna/subscriptions`)
            .query({ authToken: context.authToken })
            .end((err, res) => {
              res.status.should.not.eql(404)
              res.status.should.not.eql(500)
              res.body.should.not.be.empty
              res.body.should.have.property('subscribers')
              res.body.should.have.property('subscriptions')
              const subIds = res.body.subscriptions.map((sub) => sub.user)
              subIds.should.contain(newGroupId)
              const users = res.body.subscribers
              users.length.should.eql(1)
              users[0].type.should.eql('group')
              done()
            })
        })
    })
  })

  describe('#admin', () => {
    let adminContext = {}
      , nonAdminContext = {}

    beforeEach(async () => {
      [adminContext, nonAdminContext] = await Promise.all([
        funcTestHelper.createUserAsync('Luna', 'password'),
        funcTestHelper.createUserAsync('yole', 'wordpass')
      ])
      await funcTestHelper.createGroupAsync(adminContext, 'pepyatka-dev', 'Pepyatka Developers')
    })

    it('should reject unauthenticated users', (done) => {
      request
        .post(`${app.context.config.host}/v1/groups/pepyatka-dev/subscribers/${nonAdminContext.username}/admin`)
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(403)
          done()
        })
    })

    it('should reject nonexisting group', (done) => {
      request
        .post(`${app.context.config.host}/v1/groups/foobar/subscribers/${nonAdminContext.uesrname}/admin`)
        .send({ authToken: adminContext.authToken })
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(404)
          done()
        })
    })

    it('should allow an administrator to add another administrator', (done) => {
      request
        .post(`${app.context.config.host}/v1/groups/pepyatka-dev/subscribers/${nonAdminContext.username}/admin`)
        .send({ authToken: adminContext.authToken })
        .end((err, res) => {
          res.status.should.eql(200)
          done()
        })
    })
  })

  describe('#update', () => {
    let context = {}
      , group

    beforeEach(async () => {
      context = await funcTestHelper.createUserAsync('Luna', 'password')
      const res = await funcTestHelper.createGroupAsync(context, 'pepyatka-dev', 'Pepyatka Developers')
      group = res.group
    })

    it('should update group settings', (done) => {
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
          done()
        })
    })

    it("should not reset description if it's not provided", async () => {
      const oldScreenName = group.screenName
      const newScreenName = 'vanilla-dev'
      const newDescription = 'Vanilla Developer(s)'

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
          user:      group,
          authToken: context.authToken
        }
        await funcTestHelper.updateUserAsync(userContext, { description: newDescription })

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
          user:      group,
          authToken: context.authToken
        }
        await funcTestHelper.updateUserAsync(userContext, { screenName: newScreenName })

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

  describe('#unadmin', () => {
    let adminContext = {}
    let nonAdminContext = {}
    let group = {}

    beforeEach(async () => {
      [adminContext, nonAdminContext] = await Promise.all([
        funcTestHelper.createUserAsync('Luna', 'password'),
        funcTestHelper.createUserAsync('yole', 'wordpass')
      ]);

      group = await funcTestHelper.createGroupAsync(adminContext, 'pepyatka-dev', 'Pepyatka Developers');
      await funcTestHelper.promoteToAdmin(group, adminContext, nonAdminContext);
    })

    it('should allow an administrator to remove another administrator', async () => {
      const res = await funcTestHelper.demoteFromAdmin(group, adminContext, nonAdminContext);
      res.status.should.eql(200)
    })
  })

  describe('#updateProfilePicture', () => {
    let context = {}

    beforeEach(async () => {
      context = await funcTestHelper.createUserAsync('Luna', 'password')
      await mkdirpAsync(config.profilePictures.storage.rootDir + config.profilePictures.path)
      await funcTestHelper.createGroupAsync(context, 'pepyatka-dev', 'Pepyatka Developers');
    })

    it('should update the profile picture', (done) => {
      request
        .post(`${app.context.config.host}/v1/groups/pepyatka-dev/updateProfilePicture`)
        .set('X-Authentication-Token', context.authToken)
        .attach('file', 'test/fixtures/default-userpic-75.gif')
        .end((err, res) => {
          if (err) {
            done(err);
            return;
          }
          res.status.should.eql(200)
          res.body.should.not.be.empty
          request
            .get(`${app.context.config.host}/v1/users/pepyatka-dev`)
            .query({ authToken: context.authToken })
            .end((err, res) => {
              if (err) {
                done(err);
                return;
              }
              res.should.not.be.empty
              res.body.users.profilePictureLargeUrl.should.not.be.empty
              done()
            })
        })
    })
  })

  describe('#unsubscribeFromGroup', () => {
    let adminContext = {}
    let secondAdminContext = {}
    let groupMemberContext = {}

    beforeEach(async () => {
      [adminContext, secondAdminContext, groupMemberContext] = await Promise.all([
        funcTestHelper.createUserAsync('Luna', 'password'),
        funcTestHelper.createUserAsync('Neptune', 'password'),
        funcTestHelper.createUserAsync('Pluto', 'wordpass')
      ])

      const group = await funcTestHelper.createGroupAsync(adminContext, 'pepyatka-dev', 'Pepyatka Developers');

      await Promise.all([
        funcTestHelper.subscribeToAsync(secondAdminContext, group),
        funcTestHelper.subscribeToAsync(groupMemberContext, group)
      ]);

      await funcTestHelper.promoteToAdmin(group, adminContext, secondAdminContext);
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
  })
})
