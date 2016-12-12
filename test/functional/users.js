/* eslint-env node, mocha */
/* global $pg_database, $should */
import _ from 'lodash'
import { mkdirp } from 'mkdirp'
import request from 'superagent'
import knexCleaner from 'knex-cleaner'
import { promisify } from 'bluebird'

import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub } from '../../app/models'
import { load as configLoader } from '../../config/config'
import * as funcTestHelper from './functional_test_helper'


const mkdirpAsync = promisify(mkdirp)
const config = configLoader()

describe('UsersController', () => {
  let app

  before(async () => {
    app = await getSingleton()
    PubSub.setPublisher(new DummyPublisher())
  })

  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  describe('#create()', () => {
    it('should create a valid user', (done) => {
      const user = {
        username: 'Luna',
        password: 'password'
      }

      request
        .post(`${app.context.config.host}/v1/users`)
        .send({ username: user.username, password: user.password })
        .end((err, res) => {
          res.should.not.be.empty
          res.body.should.not.be.empty
          res.body.should.have.property('users')
          res.body.users.should.have.property('id')
          res.body.users.should.have.property('username')
          res.body.users.username.should.eql(user.username.toLowerCase())
          done()
        })
    })

    it('should create a valid user with email', (done) => {
      const user = {
        username: 'Luna',
        password: 'password',
        email:    'user@example.com'
      }

      request
        .post(`${app.context.config.host}/v1/users`)
        .send({ username: user.username, password: user.password, email: user.email })
        .end((err, res) => {
          res.should.not.be.empty
          res.body.should.not.be.empty
          res.body.should.have.property('users')
          res.body.users.should.have.property('id')
          res.body.users.should.have.property('username')
          res.body.users.username.should.eql(user.username.toLowerCase())
          res.body.users.should.have.property('email')
          res.body.users.email.should.eql(user.email)
          done()
        })
    })

    describe('onboarding', () => {
      let onboardCtx = {}

      beforeEach(async () => {
        onboardCtx = await funcTestHelper.createUserAsync('welcome', 'pw')
      })

      it('should subscribe created user to onboarding account', (done) => {
        const user = {
          username: 'Luna',
          password: 'password'
        }

        request
          .post(`${app.context.config.host}/v1/users`)
          .send({ username: user.username, password: user.password })
          .end((err, res) => {
            res.body.should.have.property('authToken')
            const authToken = res.body.authToken

            request
              .get(`${app.context.config.host}/v1/users/${user.username}/subscriptions`)
              .query({ authToken })
              .end((err, res) => {
                res.body.should.not.be.empty
                res.body.should.have.property('subscriptions')
                const types = ['Comments', 'Likes', 'Posts']

                for (const feed of res.body.subscriptions) {
                  if (!types.includes(feed.name) || feed.user != onboardCtx.user.id) {
                    done('wrong subscription');
                  }
                }

                done();
              })
          })
      })
    })

    it('should not create an invalid user', (done) => {
      const user = {
        username: 'Luna',
        password: ''
      }

      request
        .post(`${app.context.config.host}/v1/users`)
        .send({ username: user.username, password: user.password })
        .end((err, res) => {
          res.should.not.be.empty
          res.body.err.should.not.be.empty
          done()
        })
    })

    it('should not create user with slash in her username', (done) => {
      const user = {
        username: 'Lu/na',
        password: 'password'
      }

      request
        .post(`${app.context.config.host}/v1/users`)
        .send({ username: user.username, password: user.password })
        .end((err, res) => {
          res.should.not.be.empty
          res.body.err.should.not.be.empty
          res.body.err.should.eql('Invalid username')
          done()
        })
    })

    it('should not create user without password', (done) => {
      const user = { username: 'Luna' }

      request
        .post(`${app.context.config.host}/v1/users`)
        .send({ username: user.username, password: user.password })
        .end((err, res) => {
          res.should.not.be.empty
          res.body.err.should.not.be.empty
          res.body.err.should.eql('Password cannot be blank')
          done()
        })
    })

    it('should not create user with invalid email', (done) => {
      const user = {
        username: 'Luna',
        password: 'password',
        email:    'user2.example.com'
      }

      request
        .post(`${app.context.config.host}/v1/users`)
        .send({ username: user.username, password: user.password, email: user.email })
        .end((err, res) => {
          res.should.not.be.empty
          res.body.err.should.not.be.empty
          err.response.error.should.have.property('text')
          JSON.parse(err.response.error.text).err.should.eql('Invalid email')
          done()
        })
    })

    it('should not create user with empty password', (done) => {
      const user = {
        username: 'Luna',
        password: '',
      }

      request
        .post(`${app.context.config.host}/v1/users`)
        .send({ username: user.username, password: user.password, email: user.email })
        .end((err, res) => {
          res.should.not.be.empty
          res.body.err.should.not.be.empty
          err.response.error.should.have.property('text')
          JSON.parse(err.response.error.text).err.should.eql('Password cannot be blank')
          done()
        })
    })

    it('should not create a user with a duplicate name', (done) => {
      const user = {
        username: 'Luna',
        password: 'password'
      }

      request
        .post(`${app.context.config.host}/v1/users`)
        .send({ username: user.username, password: user.password })
        .end(() => {
          request
            .post(`${app.context.config.host}/v1/users`)
            .send({ username: user.username, password: user.password })
            .end((err, res) => {
              res.should.not.be.empty
              res.body.err.should.not.be.empty
              err.response.error.should.have.property('text')
              JSON.parse(err.response.error.text).err.should.eql('Already exists')
              done()
            })
        })
    })

    it('should not create user if username is in stop list', async () => {
      const user = {
        username: 'dev',
        password: 'password123',
        email:    'dev@dev.com'
      }

      const response = await funcTestHelper.createUserAsyncPost(user)
      response.status.should.equal(500)

      const data = await response.json()
      data.should.have.property('err')
      data.err.should.eql('Invalid username')
    })

    it('should not create user if username is in extra stop list', async () => {
      const user = {
        username: 'nicegirlnextdoor',
        password: 'password123',
        email:    'nicegirlnextdoor@gmail.com'
      }

      const response = await funcTestHelper.createUserAsyncPost(user)
      response.status.should.equal(500)

      const data = await response.json()
      data.should.have.property('err')
      data.err.should.eql('Invalid username')
    })
  })

  describe('#whoami()', () => {
    let authToken
    const user = {
      username: 'Luna',
      password: 'password'
    }

    beforeEach(async () => {
      const luna = await funcTestHelper.createUserAsync(user.username, user.password)
      authToken = luna.authToken
    })

    it('should return current user for a valid user', (done) => {
      request
        .get(`${app.context.config.host}/v1/users/whoami`)
        .query({ authToken })
        .end((err, res) => {
          res.should.not.be.empty
          res.body.should.not.be.empty
          res.body.should.have.property('users')
          res.body.users.should.have.property('id')
          res.body.users.should.have.property('username')
          res.body.users.username.should.eql(user.username.toLowerCase())
          done()
        })
    })

    it('should not return user for an invalid user', (done) => {
      request
        .get(`${app.context.config.host}/v1/users/whoami`)
        .query({ authToken: 'token' })
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })
  })

  describe('#subscribe()', () => {
    let lunaContext = {}
    let marsContext = {}

    beforeEach(async () => {
      [lunaContext, marsContext] = await Promise.all([
        funcTestHelper.createUserAsync('Luna', 'password'),
        funcTestHelper.createUserAsync('Mars', 'password')
      ])
      await funcTestHelper.createAndReturnPost(lunaContext, 'Post body')
    })

    it('should submit a post to friends river of news', (done) => {
      const body = 'Post body'

      request
        .post(`${app.context.config.host}/v1/users/${lunaContext.username}/subscribe`)
        .send({ authToken: marsContext.authToken })
        .end((err, res) => {
          res.body.should.not.be.empty
          res.body.should.have.property('users')
          res.body.users.should.have.property('username')
          res.body.users.username.should.eql(marsContext.username.toLowerCase())

          funcTestHelper.createPost(lunaContext, body)(() => {
            request
              .get(`${app.context.config.host}/v1/timelines/home`)
              .query({ authToken: marsContext.authToken })
              .end((err, res) => {
                res.body.should.not.be.empty
                res.body.should.have.property('timelines')
                res.body.timelines.should.have.property('posts')
                res.body.timelines.posts.length.should.eql(2)
                done()
              })
          })
        })
    })

    it('should subscribe to a user', (done) => {
      request
        .post(`${app.context.config.host}/v1/users/${lunaContext.username}/subscribe`)
        .send({ authToken: marsContext.authToken })
        .end((err, res) => {
          res.body.should.not.be.empty
          res.body.should.have.property('users')
          res.body.users.should.have.property('username')
          res.body.users.username.should.eql(marsContext.username.toLowerCase())

          request
            .get(`${app.context.config.host}/v1/timelines/home`)
            .query({ authToken: marsContext.authToken })
            .end((err, res) => {
              res.body.should.not.be.empty
              res.body.should.have.property('timelines')
              res.body.timelines.should.have.property('posts')
              res.body.timelines.posts.length.should.eql(1)

              request
                .post(`${app.context.config.host}/v1/users/${lunaContext.username}/subscribe`)
                .send({ authToken: marsContext.authToken })
                .end((err) => {
                  err.should.not.be.empty
                  err.status.should.eql(403)
                  err.response.error.should.have.property('text')
                  JSON.parse(err.response.error.text).err.should.eql('You are already subscribed to that user')

                  done()
                })
            })
        })
    })

    it('should not subscribe to herself', (done) => {
      request
        .post(`${app.context.config.host}/v1/users/${lunaContext.username}/subscribe`)
        .send({ authToken: lunaContext.authToken })
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(500)
          done()
        })
    })

    it('should require valid user to subscribe to another user', (done) => {
      request
        .post(`${app.context.config.host}/v1/users/${lunaContext.username}/subscribe`)
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })
  })

  describe('#subscribers()', () => {
    let userA
      , userB
      , authTokenB

    beforeEach(async () => {
      [userA, userB] = await Promise.all([
        funcTestHelper.createUserAsync('Luna', 'password'),
        funcTestHelper.createUserAsync('Mars', 'password')
      ])

      authTokenB = userB.authToken

      const body = 'Post body'
      await funcTestHelper.createAndReturnPost(userA, body)
      await funcTestHelper.subscribeToAsync(userB, userA)
    })

    it('should return list of subscribers', (done) => {
      request
        .get(`${app.context.config.host}/v1/users/${userA.username}/subscribers`)
        .query({ authToken: authTokenB })
        .end((err, res) => {
          res.body.should.not.be.empty
          res.body.should.have.property('subscribers')
          res.body.subscribers.should.not.be.empty
          res.body.subscribers.length.should.eql(1)
          res.body.subscribers[0].should.have.property('id')
          res.body.subscribers[0].username.should.eql(userB.username.toLowerCase())
          done()
        })
    })

    it('should return list of subscribers of public user without authorization', (done) => {
      request
        .get(`${app.context.config.host}/v1/users/${userA.username}/subscribers`)
        .end((err, res) => {
          res.body.should.not.be.empty
          res.body.should.have.property('subscribers')
          done()
        })
    })
  })

  describe('#unsubscribe()', () => {
    let userA
      , userB
      , authTokenA
      , authTokenB

    beforeEach(async () => {
      [userA, userB] = await Promise.all([
        funcTestHelper.createUserAsync('Luna', 'password'),
        funcTestHelper.createUserAsync('Mars', 'password')
      ])

      authTokenA = userA.authToken
      authTokenB = userB.authToken

      const body = 'Post body'
      await funcTestHelper.createAndReturnPost(userA, body)
      await funcTestHelper.subscribeToAsync(userB, userA)
    })

    it('should unsubscribe to a user', (done) => {
      request
        .post(`${app.context.config.host}/v1/users/${userA.username}/unsubscribe`)
        .send({ authToken: authTokenB })
        .end(() => {
          request
            .get(`${app.context.config.host}/v1/timelines/home`)
            .query({ authToken: authTokenB })
            .end((err, res) => {
              res.body.should.not.be.empty
              res.body.should.have.property('timelines')
              res.body.timelines.should.not.have.property('posts')

              request
                .post(`${app.context.config.host}/v1/users/${userA.username}/unsubscribe`)
                .send({ authToken: authTokenB })
                .end((err) => {
                  err.should.not.be.empty
                  err.status.should.eql(403)
                  err.response.error.should.have.property('text')
                  JSON.parse(err.response.error.text).err.should.eql('You are not subscribed to that user')

                  done()
                })
            })
        })
    })

    it('should not unsubscribe to herself', (done) => {
      request
        .post(`${app.context.config.host}/v1/users/${userA.username}/unsubscribe`)
        .send({ authToken: authTokenA })
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(403)
          done()
        })
    })

    it('should require valid user to unsubscribe to another user', (done) => {
      request
        .post(`${app.context.config.host}/v1/users/${userA.username}/unsubscribe`)
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })
  })

  describe('#unsubscribe() from group', () => {
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
      ])
      await funcTestHelper.promoteToAdmin(group, adminContext, secondAdminContext)
    })

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

  describe('#subscriptions()', () => {
    let userA
      , userB
      , authTokenB

    beforeEach(async () => {
      [userA, userB] = await Promise.all([
        funcTestHelper.createUserAsync('Luna', 'password'),
        funcTestHelper.createUserAsync('Mars', 'password')
      ])

      authTokenB = userB.authToken

      await funcTestHelper.subscribeToAsync(userB, userA)
    })

    it('should return list of subscriptions', (done) => {
      request
        .get(`${app.context.config.host}/v1/users/${userB.username}/subscriptions`)
        .query({ authToken: authTokenB })
        .end((err, res) => {
          res.body.should.not.be.empty
          res.body.should.have.property('subscriptions')
          const types = ['Comments', 'Likes', 'Posts']

          for (const feed of res.body.subscriptions) {
            if (!types.includes(feed.name)) {
              done('unexpected subscription');
            }
          }

          done();
        })
    })

    it('should return list of subscriptions of public user without authorization', (done) => {
      request
        .get(`${app.context.config.host}/v1/users/${userB.username}/subscriptions`)
        .end((err, res) => {
          res.body.should.not.be.empty
          res.body.should.have.property('subscriptions')
          done()
        })
    })
  })

  describe('#update()', () => {
    describe('single-user tests', () => {
      let authToken
        , user

      beforeEach(async () => {
        const luna = await funcTestHelper.createUserAsync('Luna', 'password')
        user = luna.user
        authToken = luna.authToken
      })

      it('should update current user', (done) => {
        const screenName = 'Mars'
        const description = 'The fourth planet from the Sun and the second smallest planet in the Solar System, after Mercury.'

        request
          .post(`${app.context.config.host}/v1/users/${user.id}`)
          .send({
            authToken,
            user:      { screenName, description },
            '_method': 'put'
          })
          .end((err, res) => {
            res.should.not.be.empty
            res.body.should.not.be.empty
            res.body.should.have.property('users')
            res.body.users.should.have.property('id')
            res.body.users.should.have.property('screenName')
            res.body.users.screenName.should.eql(screenName)
            res.body.users.should.have.property('description')
            res.body.users.description.should.eql(description)
            done()
          })
      })

      it("should not reset description if it's not provided", async () => {
        const oldScreenName = user.screenName
        const newScreenName = 'Ceres'
        const newDescription = 'The largest object in the asteroid belt that lies between the orbits of Mars and Jupiter.'

        // First, check screenName and description (should be the old ones)
        {
          const response = await funcTestHelper.getUserAsync({}, user.username)
          response.status.should.equal(200)

          const data = await response.json()
          data.should.have.property('users')
          data.users.should.have.property('screenName')
          data.users.screenName.should.eql(oldScreenName) // old screenName
          data.users.should.not.have.property('description') // no description property (since it's empty)
        }

        // Second, only update description (screenName shouldn't change)
        {
          await funcTestHelper.updateUserAsync({ user, authToken }, { description: newDescription })

          const response = await funcTestHelper.getUserAsync({}, user.username)
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
          await funcTestHelper.updateUserAsync({ user, authToken }, { screenName: newScreenName })

          const response = await funcTestHelper.getUserAsync({}, user.username)
          response.status.should.equal(200)

          const data = await response.json()
          data.should.have.property('users')
          data.users.should.have.property('screenName')
          data.users.screenName.should.eql(newScreenName) // new screenName
          data.users.should.have.property('description')
          data.users.description.should.eql(newDescription) // new description
        }
      })

      it('should update privacy settings', (done) => {
        request
          .post(`${app.context.config.host}/v1/users/${user.id}`)
          .send({
            authToken,
            user:      { isPrivate: '1' },
            '_method': 'put'
          })
          .end((err, res) => {
            res.should.not.be.empty
            res.body.should.not.be.empty
            res.body.should.have.property('users')
            res.body.users.should.have.property('id')
            res.body.users.should.have.property('isPrivate')
            res.body.users.isPrivate.should.eql('1')
            res.body.users.should.have.property('isProtected')
            res.body.users.isProtected.should.eql('1')
            done()
          })
      })

      it('should update visibility to anonymous', (done) => {
        request
          .post(`${app.context.config.host}/v1/users/${user.id}`)
          .send({
            authToken,
            user:      { isVisibleToAnonymous: '0' },
            '_method': 'put'
          })
          .end((err, res) => {
            res.should.not.be.empty
            res.body.should.not.be.empty
            res.body.should.have.property('users')
            res.body.users.should.have.property('id')
            res.body.users.should.have.property('isVisibleToAnonymous')
            res.body.users.should.have.property('isProtected')
            res.body.users.isVisibleToAnonymous.should.eql('0')
            res.body.users.isProtected.should.eql('1')
            done()
          })
      })

      it('should update protection settings', (done) => {
        request
          .post(`${app.context.config.host}/v1/users/${user.id}`)
          .send({
            authToken,
            user:      { isProtected: '1' },
            '_method': 'put'
          })
          .end((err, res) => {
            res.should.not.be.empty
            res.body.should.not.be.empty
            res.body.should.have.property('users')
            res.body.users.should.have.property('id')
            res.body.users.should.have.property('isVisibleToAnonymous')
            res.body.users.should.have.property('isProtected')
            res.body.users.isVisibleToAnonymous.should.eql('0')
            res.body.users.isProtected.should.eql('1')
            done()
          })
      })

      it('should require signed in user', (done) => {
        const screenName = 'Mars'

        request
          .post(`${app.context.config.host}/v1/users/${user.id}`)
          .send({
            authToken: 'abc',
            user:      { screenName },
            '_method': 'put'
          })
          .end((err) => {
            err.should.not.be.empty
            err.status.should.eql(401)
            done()
          })
      })

      const invalid = [
        '', 'a', 'aa', 'aaaaaaaaaaaaaaaaaaaaaaaaaa',
        '\u4E9C\u4E9C',  // 2 han ideographs
        '\u0928\u093F\u0928\u093F'  // Devanagari syllable "ni" (repeated 2 times)
      ]

      _.forEach(invalid, (screenName) => {
        it(`should not allow invalid screen-name: ${screenName}`, (done) => {
          request
            .post(`${app.context.config.host}/v1/users/${user.id}`)
            .send({
              authToken,
              user:      { screenName },
              '_method': 'put'
            })
            .end((err) => {
              err.should.not.be.empty
              err.status.should.eql(500)
              done()
            })
        })
      })

      const valid = [
        'aaa', 'aaaaaaaaaaaaaaaaaaaaaaaaa',
        '\u4E9C\u4E9C\u4E9C',
        '\u0928\u093F\u0928\u093F\u0928\u093F',
        // extreme grapheme example follows
        'Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍'
        // extreme grapheme example done
      ]

      _.forEach(valid, (screenName) => {
        it(`should allow valid screen-name: ${screenName}`, (done) => {
          request
            .post(`${app.context.config.host}/v1/users/${user.id}`)
            .send({
              authToken,
              user:      { screenName },
              '_method': 'put'
            })
            .end((err, res) => {
              res.should.not.be.empty
              res.body.should.not.be.empty
              res.body.should.have.property('users')
              res.body.users.should.have.property('id')
              res.body.users.should.have.property('screenName')
              res.body.users.screenName.should.eql(screenName)
              done()
            })
        })
      })
    })

    describe('double-user tests', () => {
      let lunaContext = {}
      let marsContext = {}

      beforeEach(async () => {
        [lunaContext, marsContext] = await Promise.all([
          funcTestHelper.createUserAsync('luna', 'luna', { email: 'luna@example.org' }),
          funcTestHelper.createUserAsync('mars', 'mars', { email: 'mars@example.org' })
        ])
      })

      it('should not let user use email, which is used by other user', (done) => {
        funcTestHelper.updateUserCtx(lunaContext, { email: marsContext.attributes.email })((err) => {
          $should.exist(err)
          err.status.should.eql(500)
          err.response.error.should.have.property('text')
          JSON.parse(err.response.error.text).err.should.eql('Invalid email')
          done()
        })
      })

      it('should let user to use email, which was used by other user, but not used anymore', (done) => {
        funcTestHelper.updateUserCtx(marsContext, { email: 'other@example.org' })((err) => {
          $should.not.exist(err)

          funcTestHelper.updateUserCtx(lunaContext, { email: marsContext.attributes.email })((err2) => {
            $should.not.exist(err2)
            done()
          })
        })
      })
    })

    describe('frontendPreferences tests', () => {
      let authToken
        , user

      beforeEach(async () => {
        const luna = await funcTestHelper.createUserAsync('Luna', 'password')
        user = luna.user
        authToken = luna.authToken
      })

      it('should store frontendPreferences in DB and return it in whoami', async () => {
        const prefs = {
          'net.freefeed': {
            'screenName': {
              'displayOption': 1,
              'useYou':        true
            }
          },
          'custom.domain': { 'customProperty': 'someWeirdValue' }
        }
        const anotherPrefs = {
          'another.client': { 'funnyProperty': 'withFunnyValue' },
          'custom.domain':  { 'newProperty': 'withNewValue' }
        }
        const newDescription = 'The Moon is made of cheese.';

        // First, check the response on update
        {
          const response = await funcTestHelper.updateUserAsync({ user, authToken }, { frontendPreferences: prefs })
          response.status.should.eql(200)

          const data = await response.json()
          data.should.have.deep.property('users.frontendPreferences.net\\.freefeed.screenName.displayOption')
          data.users.frontendPreferences['net.freefeed'].screenName.displayOption.should.equal(1)
          data.should.have.deep.property('users.frontendPreferences.net\\.freefeed.screenName.useYou')
          data.users.frontendPreferences['net.freefeed'].screenName.useYou.should.equal(true)
          data.users.frontendPreferences.should.have.property('custom.domain')
          data.users.frontendPreferences['custom.domain'].should.have.property('customProperty')
          data.users.frontendPreferences['custom.domain'].customProperty.should.equal('someWeirdValue')
        }

        // Second, check whoami response
        {
          const response = await funcTestHelper.whoami(authToken)
          response.status.should.eql(200)

          const data = await response.json()
          data.should.have.deep.property('users.frontendPreferences.net\\.freefeed.screenName.displayOption')
          data.users.frontendPreferences['net.freefeed'].screenName.displayOption.should.equal(1)
          data.should.have.deep.property('users.frontendPreferences.net\\.freefeed.screenName.useYou')
          data.users.frontendPreferences['net.freefeed'].screenName.useYou.should.equal(true)
          data.users.frontendPreferences.should.have.property('custom.domain')
          data.users.frontendPreferences['custom.domain'].should.have.property('customProperty')
          data.users.frontendPreferences['custom.domain'].customProperty.should.equal('someWeirdValue')
        }

        // Third, only update description (frontendPreferences shouldn't change)
        {
          await funcTestHelper.updateUserAsync({ user, authToken }, { description: newDescription })

          const response = await funcTestHelper.whoami(authToken)
          response.status.should.eql(200)

          const data = await response.json()
          data.should.have.deep.property('users.description')
          data.users.description.should.equal(newDescription)
          data.should.have.deep.property('users.frontendPreferences.net\\.freefeed.screenName.displayOption')
          data.users.frontendPreferences['net.freefeed'].screenName.displayOption.should.equal(1)
          data.should.have.deep.property('users.frontendPreferences.net\\.freefeed.screenName.useYou')
          data.users.frontendPreferences['net.freefeed'].screenName.useYou.should.equal(true)
          data.users.frontendPreferences.should.have.property('custom.domain')
          data.users.frontendPreferences['custom.domain'].should.have.property('customProperty')
          data.users.frontendPreferences['custom.domain'].customProperty.should.equal('someWeirdValue')
        }

        // Fourth, only update some sub-objects (frontendPreferences should get shallow-merged)
        {
          await funcTestHelper.updateUserAsync({ user, authToken }, { frontendPreferences: anotherPrefs })

          const response = await funcTestHelper.whoami(authToken)
          response.status.should.eql(200)

          const data = await response.json()
          data.should.have.deep.property('users.frontendPreferences')
          // net.freefeed should be unchanged
          data.users.frontendPreferences.should.have.property('net.freefeed')
          data.users.frontendPreferences['net.freefeed'].should.be.deep.equal(prefs['net.freefeed'])
          // custom domain should be replaced
          data.users.frontendPreferences.should.have.property('custom.domain')
          data.users.frontendPreferences['custom.domain'].should.be.deep.equal(anotherPrefs['custom.domain'])
          // another client should be created
          data.users.frontendPreferences.should.have.property('another.client')
          data.users.frontendPreferences['another.client'].should.be.deep.equal(anotherPrefs['another.client'])
        }
      })

      it('should validate frontendPreferences structure', async () => {
        const validPrefs = { 'net.freefeed': { 'userProperty': 'value' } }
        const invalidPrefs = { 'userProperty': 'value' }

        {
          const response = await funcTestHelper.updateUserAsync({ user, authToken }, { frontendPreferences: validPrefs })
          response.status.should.eql(200)
        }

        {
          const response = await funcTestHelper.updateUserAsync({ user, authToken }, { frontendPreferences: invalidPrefs })
          response.status.should.eql(422)

          const data = await response.json()
          data.should.have.property('err')
          data.err.should.eql('Invalid frontendPreferences')
        }
      })

      it('should validate frontendPreferences size', async () => {
        const validPrefs = { 'net.freefeed': { 'userProperty': '!'.repeat(config.frontendPreferencesLimit - 100) } }
        const invalidPrefs = { 'net.freefeed': { 'userProperty': '!'.repeat(config.frontendPreferencesLimit + 1) } }
        {
          const response = await funcTestHelper.updateUserAsync({ user, authToken }, { frontendPreferences: validPrefs })
          response.status.should.eql(200)
        }
        {
          const response = await funcTestHelper.updateUserAsync({ user, authToken }, { frontendPreferences: invalidPrefs })
          response.status.should.eql(422)

          const data = await response.json()
          data.should.have.property('err')
          data.err.should.eql('Invalid frontendPreferences')
        }
      })
    })
  })

  describe('#updatePassword()', () => {
    let authToken
      , user

    beforeEach(async () => {
      const luna = await funcTestHelper.createUserAsync('Luna', 'password')
      user = luna.user
      authToken = luna.authToken
    })

    it('should update current user password', (done) => {
      const password = 'drowssap'

      request
        .post(`${app.context.config.host}/v1/users/updatePassword`)
        .send({
          authToken,
          currentPassword:      user.password,
          password,
          passwordConfirmation: password,
          '_method':            'put'
        })
        .end((err) => {
          (err === null).should.be.true

          request
            .post(`${app.context.config.host}/v1/session`)
            .send({ username: user.username, password })
            .end((err, res) => {
              res.should.not.be.empty
              res.body.should.not.be.empty
              res.body.should.have.property('users')
              res.body.users.should.have.property('id')
              res.body.users.id.should.eql(user.id)
              done()
            })
        })
    })

    it('should not sign in with old password', (done) => {
      const password = 'drowssap'

      request
        .post(`${app.context.config.host}/v1/users/updatePassword`)
        .send({
          authToken,
          currentPassword:      user.password,
          password,
          passwordConfirmation: password,
          '_method':            'put'
        })
        .end((err) => {
          (err === null).should.be.true

          request
            .post(`${app.context.config.host}/v1/session`)
            .send({ username: user.username, password: user.password })
            .end((err) => {
              err.should.not.be.empty
              err.status.should.eql(401)
              done()
            })
        })
    })

    it('should not update password that does not match', (done) => {
      const password = 'drowssap'

      request
        .post(`${app.context.config.host}/v1/users/updatePassword`)
        .send({
          authToken,
          currentPassword:      user.password,
          password,
          passwordConfirmation: 'abc',
          '_method':            'put'
        })
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(500)
          err.response.error.should.have.property('text')
          JSON.parse(err.response.error.text).err.should.eql('Passwords do not match')
          done()
        })
    })

    it('should not update with blank password', (done) => {
      const password = ''

      request
        .post(`${app.context.config.host}/v1/users/updatePassword`)
        .send({
          authToken,
          currentPassword:      user.password,
          password,
          passwordConfirmation: password,
          '_method':            'put'
        })
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(500)
          err.response.error.should.have.property('text')
          JSON.parse(err.response.error.text).err.should.eql('Password cannot be blank')
          done()
        })
    })

    it('should not update with invalid password', (done) => {
      const password = 'drowssap'

      request
        .post(`${app.context.config.host}/v1/users/updatePassword`)
        .send({
          authToken,
          currentPassword:      'abc',
          password,
          passwordConfirmation: password,
          '_method':            'put'
        })
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(500)
          err.response.error.should.have.property('text')
          JSON.parse(err.response.error.text).err.should.eql('Your old password is not valid')
          done()
        })
    })

    it('should require signed in user', (done) => {
      const screenName = 'Mars'

      request
        .post(`${app.context.config.host}/v1/users/updatePassword`)
        .send({
          authToken: 'abc',
          user:      { screenName },
          '_method': 'put'
        })
        .end((err) => {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })
  })

  describe('#updateProfilePicture', () => {
    let authToken

    beforeEach(async () => {
      const [user] = await Promise.all([
        funcTestHelper.createUserAsync('Luna', 'password'),
        mkdirpAsync(config.profilePictures.storage.rootDir + config.profilePictures.path)
      ])

      authToken = user.authToken
    })

    it('should update the profile picture', (done) => {
      request
        .post(`${app.context.config.host}/v1/users/updateProfilePicture`)
        .set('X-Authentication-Token', authToken)
        .attach('file', 'test/fixtures/default-userpic-75.gif')
        .end((err, res) => {
          res.should.not.be.empty
          res.body.should.not.be.empty
          request
            .get(`${app.context.config.host}/v1/users/whoami`)
            .query({ authToken })
            .end((err, res) => {
              res.should.not.be.empty
              res.body.users.profilePictureLargeUrl.should.not.be.empty
              done()
            })
        })
    })

    it('should report an error if the profile picture is not an image', (done) => {
      request
        .post(`${app.context.config.host}/v1/users/updateProfilePicture`)
        .set('X-Authentication-Token', authToken)
        .attach('file', 'README.md')
        .end((err, res) => {
          res.status.should.eql(400)
          res.body.err.should.eql('Not an image file')
          done()
        })
    })
  })

  describe('#ban()', () => {
    // Zeus bans Mars, as usual
    let marsContext = {}
    let zeusContext = {}
    const username = 'zeus'
    const banUsername = 'mars'

    beforeEach(async () => {
      [marsContext, zeusContext] = await Promise.all([
        funcTestHelper.createUserAsync(banUsername, 'pw'),
        funcTestHelper.createUserAsync(username, 'pw')
      ])

      await funcTestHelper.subscribeToAsync(marsContext, zeusContext)
    })

    it('should not allow to ban user more than once', async () => {
      const promises = [
        funcTestHelper.banUser(zeusContext, marsContext),
        funcTestHelper.banUser(zeusContext, marsContext),
        funcTestHelper.banUser(zeusContext, marsContext),
        funcTestHelper.banUser(zeusContext, marsContext),
        funcTestHelper.banUser(zeusContext, marsContext)
      ];

      const countOfSuccesses = (await Promise.all(promises)).filter((r) => r.status == 200).length;
      countOfSuccesses.should.eql(1);
    });

    // Zeus bans Mars, Mars should become unsubscribed from Zeus.
    it('should unsubscribe the user', (done) => {
      request
        .get(`${app.context.config.host}/v1/users/${username}/subscriptions`)
        .query({ authToken: marsContext.authToken })
        .end((err, res) => { // Mars has subcriptions to Zeus
          res.body.should.not.be.empty
          res.body.should.have.property('subscriptions')
          const types = ['Comments', 'Likes', 'Posts']

          for (const feed of res.body.subscriptions) {
            types.includes(feed.name).should.eql(true);
          }

          request
            .post(`${app.context.config.host}/v1/users/${banUsername}/ban`)
            .send({ authToken: zeusContext.authToken })
            .end((err, res) => {
              res.body.should.not.be.empty
              request
                .get(`${app.context.config.host}/v1/users/${username}/subscriptions`)
                .query({ authToken: marsContext.authToken })
                .end((err, res) => { // Mars now has NO subcriptions to Zeus
                  res.body.should.not.be.empty
                  res.body.should.have.property('subscriptions')
                  res.body.subscriptions.length.should.eql(0)
                  done()
                })
            })
        })
    })

    // Zeus writes a post, Mars comments, Zeus bans Mars and should see no comments
    it('should ban user comments', (done) => {
      const body = 'Post'
      funcTestHelper.createPost(zeusContext, body)((err, res) => {
        res.body.should.not.be.empty
        const postId = res.body.posts.id
        funcTestHelper.createComment(body, postId, marsContext.authToken, (err, res) => {
          res.body.should.not.be.empty

          request
            .post(`${app.context.config.host}/v1/users/${banUsername}/ban`)
            .send({ authToken: zeusContext.authToken })
            .end((err, res) => {
              res.error.should.be.empty
              res.body.should.not.be.empty
              funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, (err, res) => {
                res.body.should.not.be.empty
                res.body.should.have.property('posts')
                res.body.posts.length.should.eql(1)
                const post = res.body.posts[0]
                post.should.not.have.property('comments')

                // Zeus should not see comments in single-post view either
                request
                  .get(`${app.context.config.host}/v1/posts/${postId}`)
                  .query({ authToken: zeusContext.authToken })
                  .end((err, res) => {
                    res.body.should.not.be.empty
                    res.body.should.have.property('posts')
                    res.body.posts.should.not.have.property('comments')
                    done()
                  })
              })
            })
        })
      })
    })

    // Zeus writes a post, Mars likes it, Zeus bans Mars and should not see like
    it('should ban user likes', (done) => {
      funcTestHelper.createPostForTest(zeusContext, 'Post body', (err, res) => {
        res.body.should.not.be.empty

        request
          .post(`${app.context.config.host}/v1/posts/${zeusContext.post.id}/like`)
          .send({ authToken: marsContext.authToken })
          .end((err) => {
            $should.not.exist(err)
            request
              .post(`${app.context.config.host}/v1/users/${banUsername}/ban`)
              .send({ authToken: zeusContext.authToken })
              .end((err, res) => {
                res.body.should.not.be.empty
                funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, (err, res) => {
                  res.body.should.not.be.empty
                  res.body.should.have.property('posts')
                  res.body.posts.length.should.eql(1)
                  const post = res.body.posts[0]
                  post.should.not.have.property('likes')

                  // Zeus should not see likes in single-post view either
                  request
                    .get(`${app.context.config.host}/v1/posts/${zeusContext.post.id}`)
                    .query({ authToken: zeusContext.authToken })
                    .end((err, res) => {
                      res.body.should.not.be.empty
                      res.body.should.have.property('posts')
                      res.body.posts.should.not.have.property('likes')
                      done()
                    })
                })
              })
          })
      })
    })

    // Mars writes a post, Zeus likes post, Zeus bans Mars and should not see the post any more
    it('should ban user posts', (done) => {
      funcTestHelper.createPostForTest(marsContext, 'Post body', () => {
        request
          .post(`${app.context.config.host}/v1/posts/${marsContext.post.id}/like`)
          .send({ authToken: zeusContext.authToken })
          .end(() => {
            // Now Zeus should see this post in his timeline
            funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, (err, res) => {
              res.body.should.not.be.empty
              res.body.should.have.property('posts')
              res.body.posts.length.should.eql(1)

              request
                .post(`${app.context.config.host}/v1/users/${banUsername}/ban`)
                .send({ authToken: zeusContext.authToken })
                .end((err, res) => {
                  res.body.should.not.be.empty
                  funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, (err, res) => {
                    res.body.should.not.be.empty
                    res.body.should.not.have.property('posts')
                    done()
                  })
                })
            })
          })
      })
    })

    // Zeus writes a post, Zeus bans Mars, Mars should not see Zeus post any more
    it('should completely disallow to see banning user posts', (done) => {
      funcTestHelper.createPostForTest(zeusContext, 'Post body', () => {
        // Mars sees the post because he's subscribed to Zeus
        funcTestHelper.getTimeline('/v1/timelines/home', marsContext.authToken, (err, res) => {
          res.body.should.not.be.empty
          res.body.should.have.property('posts')
          res.body.posts.length.should.eql(1)

          request
            .post(`${app.context.config.host}/v1/users/${banUsername}/ban`)
            .send({ authToken: zeusContext.authToken })
            .end((err, res) => {
              res.body.should.not.be.empty
              // Now Mars doesn't see post in his timeline
              funcTestHelper.getTimeline('/v1/timelines/home', marsContext.authToken, (err, res) => {
                res.body.should.not.be.empty
                res.body.should.not.have.property('posts')

                // Mars should not see the post in single-post view either
                request
                  .get(`${app.context.config.host}/v1/posts/${zeusContext.post.id}`)
                  .query({ authToken: marsContext.authToken })
                  .end((err) => {
                    err.should.not.be.empty
                    err.status.should.eql(403)
                    err.response.error.should.have.property('text')
                    JSON.parse(err.response.error.text).err.should.eql('This user has prevented you from seeing their posts')
                    done()
                  })
              })
            })
        })
      })
    })

    // Zeus bans Mars and Mars could not subscribe again any more
    it('should not let user resubscribe', (done) => {
      request
        .post(`${app.context.config.host}/v1/users/${banUsername}/ban`)
        .send({ authToken: zeusContext.authToken })
        .end((err, res) => {
          res.body.should.not.be.empty

          request
            .post(`${app.context.config.host}/v1/users/${username}/subscribe`)
            .send({ authToken: marsContext.authToken })
            .end((err) => {
              err.should.not.be.empty
              err.status.should.eql(403)
              err.response.error.should.have.property('text')
              JSON.parse(err.response.error.text).err.should.eql('This user prevented your from subscribing to them')
              done()
            })
        })
    })

    it("banned user should not see posts in banner's posts feed", async () => {
      await funcTestHelper.createAndReturnPost(zeusContext, 'Post body');
      await funcTestHelper.banUser(zeusContext, marsContext);

      const data = await funcTestHelper.getUserFeed(zeusContext, marsContext);

      data.should.not.be.empty
      data.should.not.have.property('posts')
    })

    it("each banned user should not see posts in banner's posts feed", async () => {
      const plutoContext = await funcTestHelper.createUserAsync('pluto', 'password')

      await funcTestHelper.subscribeToAsync(plutoContext, zeusContext.user)
      await funcTestHelper.createAndReturnPost(zeusContext, 'Post body')

      await funcTestHelper.banUser(zeusContext, marsContext);
      await funcTestHelper.banUser(zeusContext, plutoContext);

      const viewedByMars = await funcTestHelper.getUserFeed(zeusContext, marsContext);
      viewedByMars.should.not.be.empty
      viewedByMars.should.not.have.property('posts')

      const viewedByPluto = await funcTestHelper.getUserFeed(zeusContext, plutoContext);
      viewedByPluto.should.not.be.empty
      viewedByPluto.should.not.have.property('posts')
    })

    // Same fun inside groups
    describe('in groups', () => {
      const groupUserName = 'pepyatka-dev'

      beforeEach(async () => {
        const group = await funcTestHelper.createGroupAsync(marsContext, groupUserName);
        await funcTestHelper.createAndReturnPostToFeed(group, marsContext, 'post body')
      })

      // ... Zeus bans Mars and should no longer see the post in this group
      it('should ban user posts to group', (done) => {
        request
          .post(`${app.context.config.host}/v1/users/${banUsername}/ban`)
          .send({ authToken: zeusContext.authToken })
          .end((err, res) => {
            res.body.should.not.be.empty
            funcTestHelper.getTimeline(`/v1/timelines/${groupUserName}`, zeusContext.authToken, (err, res) => {
              res.body.should.not.be.empty
              res.body.should.not.have.property('posts')

              done()
            })
          })
      })
    })
  })
})
