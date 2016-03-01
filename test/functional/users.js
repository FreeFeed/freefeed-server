/*eslint-env node, mocha */
/*global $database */
import async from 'async'
import _ from 'lodash'
import mkdirp from 'mkdirp'
import request from 'superagent'

import { getSingleton } from '../../app/app'
import { load as configLoader } from '../../config/config'
import * as funcTestHelper from './functional_test_helper'


const config = configLoader()

describe("UsersController", function() {
  let app

  beforeEach(async () => {
    app = await getSingleton()
    await $database.flushdbAsync()
  })

  describe("#create()", function() {
    it('should create a valid user', function(done) {
      var user = {
        username: 'Luna',
        password: 'password'
      }

      request
        .post(app.config.host + '/v1/users')
        .send({ username: user.username, password: user.password })
        .end(function(err, res) {
          res.should.not.be.empty
          res.body.should.not.be.empty
          res.body.should.have.property('users')
          res.body.users.should.have.property('id')
          res.body.users.should.have.property('username')
          res.body.users.username.should.eql(user.username.toLowerCase())
          done()
        })
    })

    it('should create a valid user with email', function(done) {
      var user = {
        username: 'Luna',
        password: 'password',
        email: 'user@example.com'
      }

      request
        .post(app.config.host + '/v1/users')
        .send({ username: user.username, password: user.password, email: user.email })
        .end(function(err, res) {
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

    describe('onboarding', function() {
      var onboardCtx = {}
      beforeEach(funcTestHelper.createUserCtx(onboardCtx, 'welcome', 'pw'))

      it('should subscribe created user to onboarding account', function(done) {
        var user = {
          username: 'Luna',
          password: 'password'
        }

        request
          .post(app.config.host + '/v1/users')
          .send({ username: user.username, password: user.password })
          .end(function(err, res) {
            res.body.should.have.property('authToken')
            let authToken = res.body.authToken

            request
              .get(app.config.host + '/v1/users/' + user.username + '/subscriptions')
              .query({ authToken })
              .end(function(err, res) {
                res.body.should.not.be.empty
                res.body.should.have.property('subscriptions')
                var types = ['Comments', 'Likes', 'Posts']
                async.reduce(res.body.subscriptions, true, function(memo, user, callback) {
                  callback(null, memo && (types.indexOf(user.name) >= 0) && (user.user == onboardCtx.user.id))
                }, function(err, contains) {
                  contains.should.eql(true)
                  done()
                })
              })
          })
      })
    })

    it('should not create an invalid user', function(done) {
      var user = {
        username: 'Luna',
        password: ''
      }

      request
        .post(app.config.host + '/v1/users')
        .send({ username: user.username, password: user.password })
        .end(function(err, res) {
          res.should.not.be.empty
          res.body.err.should.not.be.empty
          done()
        })
    })

    it('should not create user with slash in her username', function(done) {
      var user = {
        username: 'Lu/na',
        password: 'password'
      }

      request
        .post(app.config.host + '/v1/users')
        .send({ username: user.username, password: user.password })
        .end(function(err, res) {
          res.should.not.be.empty
          res.body.err.should.not.be.empty
          res.body.err.should.eql('Invalid username')
          done()
        })
    })

    it('should not create user without password', function(done) {
      var user = {
        username: 'Luna'
      }

      request
        .post(app.config.host + '/v1/users')
        .send({ username: user.username, password: user.password })
        .end(function(err, res) {
          res.should.not.be.empty
          res.body.err.should.not.be.empty
          res.body.err.should.eql('Password cannot be blank')
          done()
        })
    })

    it('should not create user with invalid email', function(done) {
      var user = {
        username: 'Luna',
        password: 'password',
        email: 'user2.example.com'
      }

      request
        .post(app.config.host + '/v1/users')
        .send({ username: user.username, password: user.password, email: user.email })
        .end(function(err, res) {
          res.should.not.be.empty
          res.body.err.should.not.be.empty
          err.response.error.should.have.property('text')
          JSON.parse(err.response.error.text).err.should.eql('Invalid email')
          done()
        })
    })

    it('should not create user with empty password', function(done) {
      var user = {
        username: 'Luna',
        password: '',
      }

      request
        .post(app.config.host + '/v1/users')
        .send({ username: user.username, password: user.password, email: user.email })
        .end(function(err, res) {
          res.should.not.be.empty
          res.body.err.should.not.be.empty
          err.response.error.should.have.property('text')
          JSON.parse(err.response.error.text).err.should.eql('Password cannot be blank')
          done()
        })
    })

    it('should not create a user with a duplicate name', function(done) {
      var user = {
        username: 'Luna',
        password: 'password'
      }

      request
          .post(app.config.host + '/v1/users')
          .send({ username: user.username, password: user.password })
          .end(function(err, res) {
            request
                .post(app.config.host + '/v1/users')
                .send({ username: user.username, password: user.password })
                .end(function(err, res) {
                  res.should.not.be.empty
                  res.body.err.should.not.be.empty
                  err.response.error.should.have.property('text')
                  JSON.parse(err.response.error.text).err.should.eql('Already exists')
                  done()
                })
          })
    })

    it('should not create user if username is in stop list', async function() {
      const user = {
        username: 'dev',
        password: 'password123',
        email: 'dev@dev.com'
      }

      const response = await funcTestHelper.createUserAsyncPost(user)
      response.status.should.equal(422)

      let data = await response.json()
      data.should.have.property('err')
      data.err.should.eql('Invalid username')
    })

    it('should not create user if username is in extra stop list', async function() {
      const user = {
        username: 'nicegirlnextdoor',
        password: 'password123',
        email: 'nicegirlnextdoor@gmail.com'
      }

      const response = await funcTestHelper.createUserAsyncPost(user)
      response.status.should.equal(422)

      let data = await response.json()
      data.should.have.property('err')
      data.err.should.eql('Invalid username')
    })
  })

  describe("#whoami()", function() {
    var authToken
    var user = {
      username: 'Luna',
      password: 'password'
    }

    beforeEach(function(done) {
      request
        .post(app.config.host + '/v1/users')
        .send({ username: user.username, password: user.password })
        .end(function(err, res) {
          res.should.not.be.empty
          res.body.should.not.be.empty
          res.body.should.have.property('authToken')
          authToken = res.body.authToken
          done()
        })
    })

    it('should return current user for a valid user', function(done) {
      request
        .get(app.config.host + '/v1/users/whoami')
        .query({ authToken: authToken })
        .end(function(err, res) {
          res.should.not.be.empty
          res.body.should.not.be.empty
          res.body.should.have.property('users')
          res.body.users.should.have.property('id')
          res.body.users.should.have.property('username')
          res.body.users.username.should.eql(user.username.toLowerCase())
          done()
        })
    })

    it('should not return user for an invalid user', function(done) {
      request
        .get(app.config.host + '/v1/users/whoami')
        .query({ authToken: 'token' })
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })
  })

  describe('#subscribers()', function() {
    xit('should return list of subscribers')
  })

  describe('#subscribe()', function() {
    var lunaContext = {}
      , marsContext = {}

    beforeEach(funcTestHelper.createUserCtx(lunaContext, 'Luna', 'password'))
    beforeEach(funcTestHelper.createUserCtx(marsContext, 'Mars', 'password'))
    beforeEach(function(done) { funcTestHelper.createPost(lunaContext, 'Post body')(done) })

    it('should submit a post to friends river of news', function(done) {
      var body = "Post body"

      request
        .post(app.config.host + '/v1/users/' + lunaContext.username + '/subscribe')
        .send({ authToken: marsContext.authToken })
        .end(function(err, res) {
          res.body.should.not.be.empty
          res.body.should.have.property('users')
          res.body.users.should.have.property('username')
          res.body.users.username.should.eql(marsContext.username.toLowerCase())

          funcTestHelper.createPost(lunaContext, body)(function(err, res) {
            request
              .get(app.config.host + '/v1/timelines/home')
              .query({ authToken: marsContext.authToken })
              .end(function(err, res) {
                res.body.should.not.be.empty
                res.body.should.have.property('timelines')
                res.body.timelines.should.have.property('posts')
                res.body.timelines.posts.length.should.eql(2)
                done()
              })
          })
        })
    })

    it('should subscribe to a user', function(done) {
      request
        .post(app.config.host + '/v1/users/' + lunaContext.username + '/subscribe')
        .send({ authToken: marsContext.authToken })
        .end(function(err, res) {
          res.body.should.not.be.empty
          res.body.should.have.property('users')
          res.body.users.should.have.property('username')
          res.body.users.username.should.eql(marsContext.username.toLowerCase())

          request
            .get(app.config.host + '/v1/timelines/home')
            .query({ authToken: marsContext.authToken })
            .end(function(err, res) {
              res.body.should.not.be.empty
              res.body.should.have.property('timelines')
              res.body.timelines.should.have.property('posts')
              res.body.timelines.posts.length.should.eql(1)

              request
                .post(app.config.host + '/v1/users/' + lunaContext.username + '/subscribe')
                .send({ authToken: marsContext.authToken })
                .end(function(err, res) {
                  err.should.not.be.empty
                  err.status.should.eql(403)
                  err.response.error.should.have.property('text')
                  JSON.parse(err.response.error.text).err.should.eql("You are already subscribed to that user")

                  done()
                })
            })
        })
    })

    it('should not subscribe to herself', function(done) {
      request
        .post(app.config.host + '/v1/users/' + lunaContext.username + '/subscribe')
        .send({ authToken: lunaContext.authToken })
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(422)
          done()
        })
    })

    it('should require valid user to subscribe to another user', function(done) {
      request
        .post(app.config.host + '/v1/users/' + lunaContext.username + '/subscribe')
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })
  })

  describe('#subscribers()', function() {
    var userA
      , userB
      , authTokenA
      , authTokenB

    beforeEach(function(done) {
      userA = {
        username: 'Luna',
        password: 'password'
      }

      userB = {
        username: 'Mars',
        password: 'password'
      }

      request
        .post(app.config.host + '/v1/users')
        .send({ username: userA.username, password: userA.password })
        .end(function(err, res) {
          authTokenA = res.body.authToken

          request
            .post(app.config.host + '/v1/users')
            .send({ username: userB.username, password: userB.password })
            .end(function(err, res) {
              authTokenB = res.body.authToken

              var body = 'Post body'

              request
                .post(app.config.host + '/v1/posts')
                .send({ post: { body: body }, authToken: authTokenA })
                .end(function(err, res) {
                  request
                    .post(app.config.host + '/v1/users/' + userA.username + '/subscribe')
                    .send({ authToken: authTokenB })
                    .end(function(err, res) {
                      done()
                    })
                })
            })
        })
    })

    it('should return list of subscribers', function(done) {
      request
        .get(app.config.host + '/v1/users/' + userA.username + '/subscribers')
        .query({ authToken: authTokenB })
        .end(function(err, res) {
          res.body.should.not.be.empty
          res.body.should.have.property('subscribers')
          res.body.subscribers.should.not.be.empty
          res.body.subscribers.length.should.eql(1)
          res.body.subscribers[0].should.have.property('id')
          res.body.subscribers[0].username.should.eql(userB.username.toLowerCase())
          done()
        })
    })
  })

  describe('#unsubscribe()', function() {
    var userA
      , userB
      , authTokenA
      , authTokenB

    beforeEach(function(done) {
      userA = {
        username: 'Luna',
        password: 'password'
      }

      userB = {
        username: 'Mars',
        password: 'password'
      }

      request
        .post(app.config.host + '/v1/users')
        .send({ username: userA.username, password: userA.password })
        .end(function(err, res) {
          authTokenA = res.body.authToken

          request
            .post(app.config.host + '/v1/users')
            .send({ username: userB.username, password: userB.password })
            .end(function(err, res) {
              authTokenB = res.body.authToken

              var body = 'Post body'

              request
                .post(app.config.host + '/v1/posts')
                .send({ post: { body: body }, authToken: authTokenA })
                .end(function(err, res) {
                  request
                    .post(app.config.host + '/v1/users/' + userA.username + '/subscribe')
                    .send({ authToken: authTokenB })
                    .end(function(err, res) {
                      done()
                    })
                })
            })
        })
    })

    it('should unsubscribe to a user', function(done) {
      request
        .post(app.config.host + '/v1/users/' + userA.username + '/unsubscribe')
        .send({ authToken: authTokenB })
        .end(function(err, res) {
          request
            .get(app.config.host + '/v1/timelines/home')
            .query({ authToken: authTokenB })
            .end(function(err, res) {
              res.body.should.not.be.empty
              res.body.should.have.property('timelines')
              res.body.timelines.should.not.have.property('posts')

              request
                .post(app.config.host + '/v1/users/' + userA.username + '/unsubscribe')
                .send({ authToken: authTokenB })
                .end(function(err, res) {
                  err.should.not.be.empty
                  err.status.should.eql(403)
                  err.response.error.should.have.property('text')
                  JSON.parse(err.response.error.text).err.should.eql("You are not subscribed to that user")

                  done()
                })
            })
        })
    })

    it('should not unsubscribe to herself', function(done) {
      request
        .post(app.config.host + '/v1/users/' + userA.username + '/unsubscribe')
        .send({ authToken: authTokenA })
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(403)
          done()
        })
    })

    it('should require valid user to unsubscribe to another user', function(done) {
      request
        .post(app.config.host + '/v1/users/' + userA.username + '/unsubscribe')
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })
  })

  describe('#unsubscribe() from group', function() {
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

    it('should not allow admins to unsubscribe from group', function(done) {
      request
        .post(app.config.host + '/v1/users/pepyatka-dev/unsubscribe')
        .send({ authToken: adminContext.authToken })
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(403)

          request
            .post(app.config.host + '/v1/users/pepyatka-dev/unsubscribe')
            .send({ authToken: secondAdminContext.authToken })
            .end(function(err, res) {
              err.should.not.be.empty
              err.status.should.eql(403)
              done()
            })
        })
    })

    it('should allow group members to unsubscribe from group', function(done) {
      request
        .post(app.config.host + '/v1/users/pepyatka-dev/unsubscribe')
        .send({authToken: groupMemberContext.authToken})
        .end(function (err, res) {
          res.should.not.be.empty
          res.status.should.eql(200)
          done()
        })
    })
  })

  describe('#subscriptions()', function() {
    var userA
      , userB
      , authTokenA
      , authTokenB

    beforeEach(function(done) {
      userA = {
        username: 'Luna',
        password: 'password'
      }

      userB = {
        username: 'Mars',
        password: 'password'
      }

      request
        .post(app.config.host + '/v1/users')
        .send({ username: userA.username, password: userA.password })
        .end(function(err, res) {
          authTokenA = res.body.authToken

          request
            .post(app.config.host + '/v1/users')
            .send({ username: userB.username, password: userB.password })
            .end(function(err, res) {
              authTokenB = res.body.authToken

              request
                .post(app.config.host + '/v1/users/' + userA.username + '/subscribe')
                .send({ authToken: authTokenB })
                .end(function(err, res) {
                  done()
                })
            })
        })
    })

    it('should return list of subscriptions', function(done) {
      request
        .get(app.config.host + '/v1/users/' + userB.username + '/subscriptions')
        .query({ authToken: authTokenB })
        .end(function(err, res) {
          res.body.should.not.be.empty
          res.body.should.have.property('subscriptions')
          var types = ['Comments', 'Likes', 'Posts']
          async.reduce(res.body.subscriptions, true, function(memo, user, callback) {
            callback(null, memo && (types.indexOf(user.name) >= 0))
          }, function(err, contains) {
            contains.should.eql(true)
            done()
          })
        })
    })
  })

  describe("#update()", function() {
    describe('single-user tests', function() {
      "use strict";

      var authToken
        , user

      beforeEach(funcTestHelper.createUser('Luna', 'password', function(token, luna) {
        authToken = token
        user = luna
      }))

      it('should update current user', function(done) {
        var screenName = 'Mars'
        var description = 'The fourth planet from the Sun and the second smallest planet in the Solar System, after Mercury.'

        request
          .post(app.config.host + '/v1/users/' + user.id)
          .send({ authToken: authToken,
            user: { screenName: screenName, description: description },
            '_method': 'put' })
          .end(function(err, res) {
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
        var oldScreenName = user.screenName
        var newScreenName = 'Ceres'
        var newDescription = 'The largest object in the asteroid belt that lies between the orbits of Mars and Jupiter.'

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

      it('should update privacy settings', function(done) {
        var screenName = 'Mars'

        request
          .post(app.config.host + '/v1/users/' + user.id)
          .send({ authToken: authToken,
                  user: { isPrivate: '1' },
                  '_method': 'put' })
          .end(function(err, res) {
            res.should.not.be.empty
            res.body.should.not.be.empty
            res.body.should.have.property('users')
            res.body.users.should.have.property('id')
            res.body.users.should.have.property('isPrivate')
            res.body.users.isPrivate.should.eql('1')
            done()
          })
      })

      it('should require signed in user', function(done) {
        var screenName = 'Mars'

        request
          .post(app.config.host + '/v1/users/' + user.id)
          .send({ authToken: 'abc',
            user: { screenName: screenName },
            '_method': 'put' })
          .end(function(err, res) {
            err.should.not.be.empty
            err.status.should.eql(401)
            done()
          })
      })

      var invalid = [
        '', 'a', 'aa', 'aaaaaaaaaaaaaaaaaaaaaaaaaa',
        '\u4E9C\u4E9C',  // 2 han ideographs
        '\u0928\u093F\u0928\u093F'  // Devanagari syllable "ni" (repeated 2 times)
      ]

      _.forEach(invalid, function(screenName) {
        it('should not allow invalid screen-name: ' + screenName, function(done) {
          request
            .post(app.config.host + '/v1/users/' + user.id)
            .send({ authToken: authToken,
              user: { screenName: screenName },
              '_method': 'put' })
            .end(function(err, res) {
              err.should.not.be.empty
              err.status.should.eql(422)
              done()
            })
        })
      })

      var valid = [
        'aaa', 'aaaaaaaaaaaaaaaaaaaaaaaaa',
        '\u4E9C\u4E9C\u4E9C',
        '\u0928\u093F\u0928\u093F\u0928\u093F',
        // extreme grapheme example follows
        'Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̯̞̠͍'
        // extreme grapheme example done
      ]

      _.forEach(valid, function(screenName) {
        it('should allow valid screen-name: ' + screenName, function(done) {
          request
            .post(app.config.host + '/v1/users/' + user.id)
            .send({ authToken: authToken,
              user: { screenName: screenName },
              '_method': 'put' })
            .end(function(err, res) {
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

    describe('double-user tests', function() {
      "use strict";

      var lunaContext = {}
      var marsContext = {}

      beforeEach(funcTestHelper.createUserCtx(lunaContext, 'luna', 'luna', {email: "luna@example.org"}))
      beforeEach(funcTestHelper.createUserCtx(marsContext, 'mars', 'mars', {email: "mars@example.org"}))

      it('should not let user use email, which is used by other user', function(done) {
        funcTestHelper.updateUserCtx(lunaContext, {email: marsContext.attributes.email})(function(err, response) {
          $should.exist(err)
          err.status.should.eql(422)
          err.response.error.should.have.property('text')
          JSON.parse(err.response.error.text).err.should.eql('Invalid email')
          done()
        })
      })

      it('should let user to use email, which was used by other user, but not used anymore', function(done) {
        funcTestHelper.updateUserCtx(marsContext, {email: 'other@example.org'})(function (err, response) {
          $should.not.exist(err)

          funcTestHelper.updateUserCtx(lunaContext, {email: marsContext.attributes.email})(function (err2, response2) {
            $should.not.exist(err2)
            done()
          })
        })
      })
    })

    describe('frontendPreferences tests', function() {
      var authToken
        , user

      beforeEach(funcTestHelper.createUser('Luna', 'password', function (token, luna) {
        authToken = token
        user = luna
      }))

      it('should store frontendPreferences in DB and return it in whoami', async () => {
        let prefs = {
          'net.freefeed': {
            'screenName': {
              'displayOption': 1,
              'useYou': true
            }
          },
          'custom.domain': {
            'customProperty': 'someWeirdValue'
          }
        }
        let newPrefs = {
          'another.client': {
            'funnyProperty': 'withFunnyValue'
          },
          'net.freefeed': {
            'screenName': {
              'displayOption': 2,
              'useYou': false
            }
          }
        }
        let newDescription = 'The Moon is made of cheese.';

        // First, check the response on update
        {
          let response = await funcTestHelper.updateUserAsync({ user, authToken }, { frontendPreferences: prefs })
          response.status.should.eql(200)

          let data = await response.json()
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
          let response = await funcTestHelper.whoami(authToken)
          response.status.should.eql(200)

          let data = await response.json()
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

          let response = await funcTestHelper.whoami(authToken)
          response.status.should.eql(200)

          let data = await response.json()
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

        // Fourth, only update some sub-objects (frontendPreferences should get deep-merged)
        {
          await funcTestHelper.updateUserAsync({ user, authToken }, { frontendPreferences: newPrefs })

          let response = await funcTestHelper.whoami(authToken)
          response.status.should.eql(200)

          let data = await response.json()
          // another.client
          data.should.have.deep.property('users.frontendPreferences.another\\.client')
          data.users.frontendPreferences['another.client'].should.have.property('funnyProperty')
          data.users.frontendPreferences['another.client'].funnyProperty.should.equal('withFunnyValue')
          // net.freefeed
          data.users.frontendPreferences.should.have.property('net.freefeed')
          data.users.frontendPreferences['net.freefeed'].should.have.deep.property('screenName.displayOption')
          data.users.frontendPreferences['net.freefeed'].screenName.displayOption.should.equal(2)
          data.users.frontendPreferences['net.freefeed'].should.have.deep.property('screenName.useYou')
          data.users.frontendPreferences['net.freefeed'].screenName.useYou.should.equal(false)
          // custom domain
          data.users.frontendPreferences.should.have.property('custom.domain')
          data.users.frontendPreferences['custom.domain'].should.have.property('customProperty')
          data.users.frontendPreferences['custom.domain'].customProperty.should.equal('someWeirdValue')
        }
      })

      it('should validate frontendPreferences structure', async () => {
        let validPrefs = {
          'net.freefeed': {
            'userProperty': 'value'
          }
        }
        let invalidPrefs = {
          'userProperty': 'value'
        }

        {
          let response = await funcTestHelper.updateUserAsync({ user, authToken }, { frontendPreferences: validPrefs })
          response.status.should.eql(200)
        }

        {
          let response = await funcTestHelper.updateUserAsync({ user, authToken }, { frontendPreferences: invalidPrefs })
          response.status.should.eql(422)

          let data = await response.json()
          data.should.have.property('err')
          data.err.should.eql('Invalid frontendPreferences')
        }
      })

      it('should validate frontendPreferences size', async () => {
        let validPrefs = {
          'net.freefeed': {
            'userProperty': '!'.repeat(config.frontendPreferencesLimit - 100)
          }
        }
        let invalidPrefs = {
          'net.freefeed': {
            'userProperty': '!'.repeat(config.frontendPreferencesLimit + 1)
          }
        }
        {
          let response = await funcTestHelper.updateUserAsync({ user, authToken }, { frontendPreferences: validPrefs })
          response.status.should.eql(200)
        }
        {
          let response = await funcTestHelper.updateUserAsync({ user, authToken }, { frontendPreferences: invalidPrefs })
          response.status.should.eql(422)

          let data = await response.json()
          data.should.have.property('err')
          data.err.should.eql('Invalid frontendPreferences')
        }
      })
    })

  })

  describe("#updatePassword()", function() {
    var authToken
      , user

    beforeEach(funcTestHelper.createUser('Luna', 'password', function(token, luna) {
      authToken = token
      user = luna
    }))

    it('should update current user password', function(done) {
      var screenName = 'Mars'
      var password = "drowssap"

      request
        .post(app.config.host + '/v1/users/updatePassword')
        .send({ authToken: authToken,
                currentPassword: user.password,
                password: password,
                passwordConfirmation: password,
                '_method': 'put' })
        .end(function(err, res) {
          (err === null).should.be.true

          request
            .post(app.config.host + '/v1/session')
            .send({ username: user.username, password: password })
            .end(function(err, res) {
              res.should.not.be.empty
              res.body.should.not.be.empty
              res.body.should.have.property('users')
              res.body.users.should.have.property('id')
              res.body.users.id.should.eql(user.id)
              done()
            })
        })
    })

    it('should not sign in with old password', function(done) {
      var screenName = 'Mars'
      var password = "drowssap"

      request
        .post(app.config.host + '/v1/users/updatePassword')
        .send({ authToken: authToken,
                currentPassword: user.password,
                password: password,
                passwordConfirmation: password,
                '_method': 'put' })
        .end(function(err, res) {
          (err === null).should.be.true

          request
            .post(app.config.host + '/v1/session')
            .send({ username: user.username, password: user.password })
            .end(function(err, res) {
              err.should.not.be.empty
              err.status.should.eql(401)
              done()
            })
        })
    })

    it('should not update password that does not match', function(done) {
      var screenName = 'Mars'
      var password = "drowssap"

      request
        .post(app.config.host + '/v1/users/updatePassword')
        .send({ authToken: authToken,
                currentPassword: user.password,
                password: password,
                passwordConfirmation: "abc",
                '_method': 'put' })
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(422)
          err.response.error.should.have.property('text')
          JSON.parse(err.response.error.text).err.should.eql('Passwords do not match')
          done()
        })
    })

    it('should not update with blank password', function(done) {
      var screenName = 'Mars'
      var password = ""

      request
        .post(app.config.host + '/v1/users/updatePassword')
        .send({ authToken: authToken,
                currentPassword: user.password,
                password: password,
                passwordConfirmation: password,
                '_method': 'put' })
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(422)
          err.response.error.should.have.property('text')
          JSON.parse(err.response.error.text).err.should.eql('Password cannot be blank')
          done()
        })
    })

    it('should not update with invalid password', function(done) {
      var screenName = 'Mars'
      var password = "drowssap"

      request
        .post(app.config.host + '/v1/users/updatePassword')
        .send({ authToken: authToken,
                currentPassword: "abc",
                password: password,
                passwordConfirmation: password,
                '_method': 'put' })
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(422)
          err.response.error.should.have.property('text')
          JSON.parse(err.response.error.text).err.should.eql('Your old password is not valid')
          done()
        })
    })

    it('should require signed in user', function(done) {
      var screenName = 'Mars'

      request
        .post(app.config.host + '/v1/users/updatePassword')
        .send({ authToken: 'abc',
                user: { screenName: screenName },
                '_method': 'put' })
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })
  })

  describe('#updateProfilePicture', function() {
    var authToken
      , user

    beforeEach(funcTestHelper.createUser('Luna', 'password', function (token, luna) {
      authToken = token
      user = luna
    }))

    beforeEach(function(done){
      mkdirp.sync(config.profilePictures.storage.rootDir + config.profilePictures.path)
      done()
    })

    it('should update the profile picture', function(done) {
      request
        .post(app.config.host + '/v1/users/updateProfilePicture')
        .set('X-Authentication-Token', authToken)
        .attach('file', 'test/fixtures/default-userpic-75.gif')
        .end(function(err, res) {
          res.should.not.be.empty
          res.body.should.not.be.empty
          request
            .get(app.config.host + '/v1/users/whoami')
            .query({ authToken: authToken })
            .end(function(err, res) {
              res.should.not.be.empty
              res.body.users.profilePictureLargeUrl.should.not.be.empty
              done()
            })
        })
    })

    it('should report an error if the profile picture is not an image', function(done) {
      request
        .post(app.config.host + '/v1/users/updateProfilePicture')
        .set('X-Authentication-Token', authToken)
        .attach('file', 'README.md')
        .end(function(err, res) {
          res.status.should.eql(400)
          res.body.err.should.eql("Not an image file")
          done()
        })
    })
  })

  describe('#ban()', function() {
    // Zeus bans Mars, as usual
    var marsContext = {}
    var zeusContext = {}
    var username = 'zeus'
    var banUsername = 'mars'

    beforeEach(funcTestHelper.createUserCtx(marsContext, banUsername, 'pw'))
    beforeEach(funcTestHelper.createUserCtx(zeusContext, username, 'pw'))

    // Mars is subscribed to Zeus
    beforeEach(function(done) {
      request
        .post(app.config.host + '/v1/users/' + username + '/subscribe')
        .send({ authToken: marsContext.authToken })
        .end(function(err, res) {
          res.body.should.not.be.empty
          done()
        })
    })

    // Zeus bans Mars, Mars should become unsubscribed from Zeus.
    it('should unsubscribe the user', function(done) {
      request
        .get(app.config.host + '/v1/users/' + username + '/subscriptions')
        .query({ authToken: marsContext.authToken })
        .end(function(err, res) { // Mars has subcriptions to Zeus
          res.body.should.not.be.empty
          res.body.should.have.property('subscriptions')
          var types = ['Comments', 'Likes', 'Posts']
          async.reduce(res.body.subscriptions, true, function(memo, user, callback) {
            callback(null, memo && (types.indexOf(user.name) >= 0))
          }, function(err, contains) {
            contains.should.eql(true)
          })
          request
            .post(app.config.host + '/v1/users/' + banUsername + '/ban')
            .send({ authToken: zeusContext.authToken })
            .end(function(err, res) {
              res.body.should.not.be.empty
              request
                .get(app.config.host + '/v1/users/' + username + '/subscriptions')
                .query({ authToken: marsContext.authToken })
                .end(function(err, res) { // Mars now has NO subcriptions to Zeus
                  res.body.should.not.be.empty
                  res.body.should.have.property('subscriptions')
                  res.body.subscriptions.length.should.eql(0)
                  done()
                })
            })
        })
    })

    // Zeus writes a post, Mars comments, Zeus bans Mars and should see no comments
    it('should ban user comments', function(done) {
      var body = 'Post'
      funcTestHelper.createPost(zeusContext, body)(function(err, res) {
        res.body.should.not.be.empty
        var postId = res.body.posts.id
        funcTestHelper.createComment(body, postId, marsContext.authToken, function(err, res) {
          res.body.should.not.be.empty

          request
            .post(app.config.host + '/v1/users/' + banUsername + '/ban')
            .send({ authToken: zeusContext.authToken })
            .end(function(err, res) {
              res.error.should.be.empty
              res.body.should.not.be.empty
              funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, function(err, res) {
                res.body.should.not.be.empty
                res.body.should.have.property('posts')
                res.body.posts.length.should.eql(1)
                var post = res.body.posts[0]
                post.should.not.have.property('comments')

                // Zeus should not see comments in single-post view either
                request
                  .get(app.config.host + '/v1/posts/' + postId)
                  .query({ authToken: zeusContext.authToken })
                  .end(function(err, res) {
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
    it('should ban user likes', function(done) {
      funcTestHelper.createPostForTest(zeusContext, 'Post body', function(err, res) {
          res.body.should.not.be.empty

          request
            .post(app.config.host + '/v1/posts/' + zeusContext.post.id + '/like')
            .send({ authToken: marsContext.authToken })
            .end(function(err, res) {
              $should.not.exist(err)
              request
                .post(app.config.host + '/v1/users/' + banUsername + '/ban')
                .send({ authToken: zeusContext.authToken })
                .end(function(err, res) {
                  res.body.should.not.be.empty
                  funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, function(err, res) {
                    res.body.should.not.be.empty
                    res.body.should.have.property('posts')
                    res.body.posts.length.should.eql(1)
                    var post = res.body.posts[0]
                    post.should.not.have.property('likes')

                    // Zeus should not see likes in single-post view either
                    request
                      .get(app.config.host + '/v1/posts/' + zeusContext.post.id)
                      .query({ authToken: zeusContext.authToken })
                      .end(function(err, res) {
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
    it('should ban user posts', function(done) {
      funcTestHelper.createPostForTest(marsContext, 'Post body', function(err, res) {
        request
          .post(app.config.host + '/v1/posts/' + marsContext.post.id + '/like')
          .send({ authToken: zeusContext.authToken })
          .end(function(err, res) {
            // Now Zeus should see this post in his timeline
            funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, function(err, res) {
              res.body.should.not.be.empty
              res.body.should.have.property('posts')
              res.body.posts.length.should.eql(1)

              request
                .post(app.config.host + '/v1/users/' + banUsername + '/ban')
                .send({ authToken: zeusContext.authToken })
                .end(function(err, res) {
                  res.body.should.not.be.empty
                  funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, function(err, res) {
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
    it('should completely disallow to see banning user posts', function(done) {
      funcTestHelper.createPostForTest(zeusContext, 'Post body', function(err, res) {
        // Mars sees the post because he's subscribed to Zeus
        funcTestHelper.getTimeline('/v1/timelines/home', marsContext.authToken, function(err, res) {
          res.body.should.not.be.empty
          res.body.should.have.property('posts')
          res.body.posts.length.should.eql(1)

          request
            .post(app.config.host + '/v1/users/' + banUsername + '/ban')
            .send({ authToken: zeusContext.authToken })
            .end(function(err, res) {
              res.body.should.not.be.empty
              // Now Mars doesn't see post in his timeline
              funcTestHelper.getTimeline('/v1/timelines/home', marsContext.authToken, function(err, res) {
                res.body.should.not.be.empty
                res.body.should.not.have.property('posts')

                // Mars should not see the post in single-post view either
                request
                  .get(app.config.host + '/v1/posts/' + zeusContext.post.id)
                  .query({ authToken: marsContext.authToken })
                  .end(function(err, res) {
                    err.should.not.be.empty
                    err.status.should.eql(403)
                    err.response.error.should.have.property('text')
                    JSON.parse(err.response.error.text).err.should.eql("This user has prevented you from seeing their posts")
                    done()
                  })
              })
            })
        })
      })
    })

    // Zeus bans Mars and Mars could not subscribe again any more
    it('should not let user resubscribe', function(done) {
      request
        .post(app.config.host + '/v1/users/' + banUsername + '/ban')
        .send({ authToken: zeusContext.authToken })
        .end(function(err, res) {
          res.body.should.not.be.empty

          request
            .post(app.config.host + '/v1/users/' + username + '/subscribe')
            .send({ authToken: marsContext.authToken })
            .end(function(err, res) {
              err.should.not.be.empty
              err.status.should.eql(403)
              err.response.error.should.have.property('text')
              JSON.parse(err.response.error.text).err.should.eql("This user prevented your from subscribing to them")
              done()
            })
        })
    })

    // Same fun inside groups
    describe('in groups', function() {
      var groupUserName = 'pepyatka-dev'

      // Mars creates a group, Mars posts to it...
      beforeEach(function(done) {
        request
          .post(app.config.host + '/v1/groups')
          .send({ group: { username: groupUserName },
                  authToken: marsContext.authToken })
          .end(function(err, res) {
            res.body.should.not.be.empty
            request
              .post(app.config.host + '/v1/posts')
              .send({ post: { body: 'post body' }, meta: { feeds: [groupUserName] },
                      authToken: marsContext.authToken })
              .end(function(err, res) {
                res.body.should.not.be.empty
                res.body.should.have.property('posts')
                res.body.posts.should.have.property('body')

                done()
              })
          })
      })

      // ... Zeus bans Mars and should no longer see the post in this group
      it('should ban user posts to group', function(done) {
        request
          .post(app.config.host + '/v1/users/' + banUsername + '/ban')
          .send({ authToken: zeusContext.authToken })
          .end(function(err, res) {
            res.body.should.not.be.empty
            funcTestHelper.getTimeline('/v1/timelines/' + groupUserName, zeusContext.authToken, function(err, res) {
              res.body.should.not.be.empty
              res.body.should.not.have.property('posts')

              done()
            })
          })
      })
    })
  })
})
