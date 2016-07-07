/*eslint-env node, mocha */
/*global $database */
import request from 'superagent'
import _ from 'lodash'
import knexCleaner from 'knex-cleaner'

import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub } from '../../app/models'
import * as funcTestHelper from './functional_test_helper'


describe("Privates", function() {
  let app

  before(async () => {
    app = await getSingleton()
    PubSub.setPublisher(new DummyPublisher())
  })

  beforeEach(async () => {
    await $database.flushdbAsync()
    await knexCleaner.clean($pg_database)
  })

  describe('user Luna and user Mars', function() {
    var lunaContext = {}
      , marsContext = {}
      , zeusContext = {}

    beforeEach(funcTestHelper.createUserCtx(lunaContext, 'luna', 'pw'))
    beforeEach(funcTestHelper.createUserCtx(marsContext, 'mars', 'pw'))
    beforeEach(funcTestHelper.createUserCtx(zeusContext, 'zeus', 'pw'))

    describe('publish private post to public feed', function() {
      var group = 'group'

      beforeEach(function(done) { funcTestHelper.subscribeToCtx(marsContext, lunaContext.username)(done) })
      beforeEach(function(done) { funcTestHelper.subscribeToCtx(lunaContext, marsContext.username)(done) })
      beforeEach(function(done) {
        request
          .post(app.config.host + '/v1/groups')
          .send({ group: { username: group, screenName: group },
                  authToken: lunaContext.authToken })
          .end(function(err, res) {
            done()
          })
      })
      beforeEach(function(done) { funcTestHelper.subscribeToCtx(zeusContext, group)(done) })

      it('should send private post to public feed', function(done) {
        var post = 'post'
        request
          .post(app.config.host + '/v1/posts')
          .send({ post: { body: post }, meta: { feeds: [group, lunaContext.user.username] }, authToken: lunaContext.authToken })
          .end(function(err, res) {
            funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, function(err, res) {
              _.isUndefined(res).should.be.false
              res.body.should.not.be.empty
              res.body.should.have.property('timelines')
              res.body.timelines.should.have.property('name')
              res.body.timelines.name.should.eql('RiverOfNews')
              res.body.timelines.should.have.property('posts')
              res.body.timelines.posts.length.should.eql(1)
              res.body.should.have.property('posts')
              res.body.posts.length.should.eql(1)
              var _post = res.body.posts[0]
              _post.body.should.eql(post)
              request
                .post(app.config.host + '/v1/posts/' + _post.id + '/like')
                .send({ authToken: zeusContext.authToken })
                .end(function(err, res) {
                  funcTestHelper.getTimeline('/v1/timelines/' + zeusContext.user.username +'/likes', zeusContext.authToken, function(err, res) {
                    _.isUndefined(res).should.be.false
                    res.body.should.not.be.empty
                    res.body.should.have.property('timelines')
                    res.body.timelines.should.have.property('name')
                    res.body.timelines.name.should.eql('Likes')
                    res.body.timelines.should.have.property('posts')
                    res.body.timelines.posts.length.should.eql(1)
                    res.body.should.have.property('posts')
                    res.body.posts.length.should.eql(1)
                    var _post = res.body.posts[0]
                    _post.body.should.eql(post)
                    request
                      .get(app.config.host + '/v1/posts/' + _post.id)
                      .query({ authToken: zeusContext.authToken })
                      .end(function(err, res) {
                        _.isUndefined(res).should.be.false
                        res.body.should.not.be.empty
                        res.body.posts.body.should.eql(_post.body)
                        done()
                      })
                  })
                })
            })
          })
      })
    })

    describe('can protect private posts', function() {
      var herculesContext = {}

      beforeEach(function(done) { funcTestHelper.subscribeToCtx(marsContext, lunaContext.username)(done) })
      beforeEach(function(done) { funcTestHelper.subscribeToCtx(lunaContext, marsContext.username)(done) })
      beforeEach(function(done) { funcTestHelper.subscribeToCtx(zeusContext, lunaContext.username)(done) })
      beforeEach(() => funcTestHelper.goPrivate(lunaContext))
      beforeEach(function(done) { funcTestHelper.createPost(lunaContext, 'Post body')(done) })
      beforeEach(funcTestHelper.createUserCtx(herculesContext, 'hercules', 'pw'))

      describe('and manage subscription requests', function() {
        beforeEach(function(done) {
          request
            .post(app.config.host + '/v1/users/' + lunaContext.user.username + '/sendRequest')
            .send({ authToken: zeusContext.authToken,
                    '_method': 'post' })
            .end(function(err, res) {
              done()
            })
        })

        it('should reject subscription request after ban', function(done) {
          request
            .post(app.config.host + '/v1/users/' + zeusContext.user.username + '/ban')
            .send({ authToken: lunaContext.authToken })
            .end(function(err, res) {
              request
                .get(app.config.host + '/v1/users/whoami')
                .query({ authToken: lunaContext.authToken })
                .end(function(err, res) {
                  res.should.not.be.empty
                  res.body.should.not.be.empty
                  res.body.should.have.property('users')
                  res.body.users.should.not.have.property('subscriptionRequests')
                  done()
                })
            })
        })

        it('should not allow banned user to send subscription request', function(done) {
          request
            .post(app.config.host + '/v1/users/' + zeusContext.user.username + '/ban')
            .send({ authToken: lunaContext.authToken })
            .end(function(err, res) {
              request
                .post(app.config.host + '/v1/users/' + lunaContext.user.username + '/sendRequest')
                .send({ authToken: zeusContext.authToken,
                        '_method': 'post' })
                .end(function(err, res) {
                  res.should.not.be.empty
                  res.body.err.should.not.be.empty
                  res.body.err.should.eql('Invalid')
                  request
                    .get(app.config.host + '/v1/users/whoami')
                    .query({ authToken: lunaContext.authToken })
                    .end(function(err, res) {
                      res.should.not.be.empty
                      res.body.should.not.be.empty
                      res.body.should.have.property('users')
                      res.body.users.should.not.have.property('subscriptionRequests')
                      done()
                    })
                })
            })
        })

        it('should show liked post per context', function(done) {
          request
            .post(app.config.host + '/v1/users/acceptRequest/' + zeusContext.user.username)
            .send({ authToken: lunaContext.authToken,
                    '_method': 'post' })
            .end(function(err, res) {
              request
                .post(app.config.host + '/v1/posts/' + lunaContext.post.id + '/like')
                .send({ authToken: marsContext.authToken })
                .end(function(err, res) {
                  funcTestHelper.getTimeline('/v1/timelines/' + marsContext.user.username + '/likes', marsContext.authToken, function(err, res) {
                    res.body.should.have.property('posts')

                    funcTestHelper.getTimeline('/v1/timelines/' + marsContext.user.username + '/likes', zeusContext.authToken, function(err, res) {
                      // view mars/likes timeline as zeus
                      res.body.should.have.property('posts')

                      done()
                    })
                  })
                })
            })
        })

        it('should show liked post per context', function(done) {
          request
            .post(app.config.host + '/v1/users/acceptRequest/' + zeusContext.user.username)
            .send({ authToken: lunaContext.authToken,
                    '_method': 'post' })
            .end(function(err, res) {
              funcTestHelper.createComment('comment', lunaContext.post.id, marsContext.authToken, function(err, res) {
                funcTestHelper.getTimeline('/v1/timelines/' + marsContext.user.username + '/comments', marsContext.authToken, function(err, res) {
                  res.body.should.have.property('posts')

                  funcTestHelper.getTimeline('/v1/timelines/' + marsContext.user.username + '/comments', zeusContext.authToken, function(err, res) {
                    // view mars/comments timeline as zeus
                    res.body.should.have.property('posts')

                    done()
                  })
                })
              })
            })
        })

        it('should not be accepted by invalid user', function(done) {
          request
            .post(app.config.host + '/v1/users/acceptRequest/' + zeusContext.user.username)
            .send({ authToken: zeusContext.authToken,
                    '_method': 'post' })
            .end(function(err, res) {
              err.should.not.be.empty
              err.status.should.eql(422)
              done()
            })
        })

        it('should be able to accept', function(done) {
          request
            .post(app.config.host + '/v1/users/acceptRequest/' + zeusContext.user.username)
            .send({ authToken: lunaContext.authToken,
                    '_method': 'post' })
            .end(function(err, res) {
              res.should.not.be.empty
              res.error.should.be.empty

              request
                .get(app.config.host + '/v1/users/whoami')
                .query({ authToken: lunaContext.authToken })
                .end(function(err, res) {
                  // check there are no subscription requests
                  res.should.not.be.empty
                  res.body.should.not.be.empty
                  res.body.should.have.property('users')
                  res.body.users.should.not.have.property('subscriptionRequests')
                  res.body.should.not.have.property('requests')

                  request
                    .get(app.config.host + '/v1/users/whoami')
                    .query({ authToken: lunaContext.authToken })
                    .end(function(err, res) {
                      // check there are no pending requests
                      res.should.not.be.empty
                      res.body.should.not.be.empty
                      res.body.should.have.property('users')
                      res.body.users.should.not.have.property('pendingSubscriptionRequests')
                      res.body.should.not.have.property('requests')

                      funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, function(err, res) {
                        // check user is subscribed
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
                        post.body.should.eql(lunaContext.post.body)
                        done()
                      })
                    })
                })
            })
        })

        it('should be able to reject', function(done) {
          request
            .post(app.config.host + '/v1/users/' + lunaContext.user.username + '/sendRequest')
            .send({ authToken: herculesContext.authToken,
                    '_method': 'post' })
            .end(function(err, res) {
              request
                .post(app.config.host + '/v1/users/rejectRequest/' + herculesContext.user.username)
                .send({ authToken: lunaContext.authToken,
                        '_method': 'post' })
                .end(function(err, res) {
                  res.should.not.be.empty
                  res.error.should.be.empty

                  request
                    .get(app.config.host + '/v1/users/whoami')
                    .query({ authToken: lunaContext.authToken })
                    .end(function(err, res) {
                      // check there are no subscription requests
                      res.should.not.be.empty
                      res.body.should.not.be.empty
                      res.body.should.have.property('users')
                      res.body.users.should.have.property('subscriptionRequests')
                      res.body.should.have.property('requests')
                      // request from zeus
                      res.body.users.subscriptionRequests.length.should.eql(1)
                      res.body.requests.length.should.eql(1)

                      request
                        .get(app.config.host + '/v1/users/whoami')
                        .query({ authToken: herculesContext.authToken })
                        .end(function(err, res) {
                          res.should.not.be.empty
                          res.body.should.not.be.empty
                          res.body.should.have.property('users')
                          res.body.users.should.not.have.property('pendingSubscriptionRequests')
                          res.body.should.not.have.property('requests')

                          funcTestHelper.getTimeline('/v1/timelines/home', herculesContext.authToken, function(err, res) {
                            // check user is not subscribed
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
            })
        })
      })

      xit('should protect user stats', function(done) {
        funcTestHelper.getTimeline('/v1/timelines/' + lunaContext.user.username, herculesContext.authToken, function(err, res) {
          res.should.not.be.empty
          res.body.should.not.be.empty
          res.body.should.have.property('users')
          res.body.users[0].should.not.have.property('statistics')

          funcTestHelper.getTimeline('/v1/timelines/' + lunaContext.user.username, lunaContext.authToken, function(err, res) {
            res.should.not.be.empty
            res.body.should.not.be.empty
            res.body.should.have.property('users')
            res.body.users[0].should.have.property('statistics')
            done()
          })
        })
      })

      it('should protect subscribers of private user', async function(done) {
        const lunaSubscribersViewedByAnonymous = await funcTestHelper.getSubscribersAsync(lunaContext.username)
        lunaSubscribersViewedByAnonymous.status.should.equal(403)
        let viewedByAnonymous = await lunaSubscribersViewedByAnonymous.json()
        viewedByAnonymous.should.have.property('err')  // anonymous doesn't have access

        const lunaSubscribersViewedByHercules = await funcTestHelper.getSubscribersAsync(lunaContext.username, herculesContext)
        lunaSubscribersViewedByHercules.status.should.equal(403)
        const viewedByHercules = await lunaSubscribersViewedByHercules.json()
        viewedByHercules.should.have.property('err')  // hercules doesn't have access

        const lunaSubscribersViewedByMars = await funcTestHelper.getSubscribersAsync(lunaContext.username, marsContext)
        const viewedByMars = await lunaSubscribersViewedByMars.json()
        viewedByMars.should.not.have.property('err')  // mars has access

        const lunaSubscribersViewedByLuna = await funcTestHelper.getSubscribersAsync(lunaContext.username, lunaContext)
        const viewedByLuna = await lunaSubscribersViewedByLuna.json()
        viewedByLuna.should.not.have.property('err')  // luna is an owner

        const lunaFeedViewedByAnonymous = await funcTestHelper.getUserFeed(lunaContext)
        lunaFeedViewedByAnonymous.timelines.should.not.have.property('subscribers')
        lunaFeedViewedByAnonymous.should.not.have.property('subscribers')
        lunaFeedViewedByAnonymous.should.not.have.property('admins')

        const lunaFeedViewedByHercules = await funcTestHelper.getUserFeed(lunaContext, herculesContext)
        lunaFeedViewedByHercules.timelines.should.not.have.property('subscribers')
        lunaFeedViewedByHercules.should.not.have.property('subscribers')
        lunaFeedViewedByHercules.should.not.have.property('admins')

        const lunaFeedViewedByMars = await funcTestHelper.getUserFeed(lunaContext, marsContext)
        lunaFeedViewedByMars.timelines.should.have.property('subscribers')
        lunaFeedViewedByMars.should.have.property('subscribers')
        lunaFeedViewedByMars.should.have.property('admins')

        const lunaLikesFeedViewedByAnonymous = await funcTestHelper.getUserLikesFeed(lunaContext)
        lunaLikesFeedViewedByAnonymous.timelines.should.not.have.property('subscribers')
        lunaLikesFeedViewedByAnonymous.should.not.have.property('subscribers')
        lunaLikesFeedViewedByAnonymous.should.not.have.property('admins')

        const lunaLikesFeedViewedByHercules = await funcTestHelper.getUserLikesFeed(lunaContext, herculesContext)
        lunaLikesFeedViewedByHercules.timelines.should.not.have.property('subscribers')
        lunaLikesFeedViewedByHercules.should.not.have.property('subscribers')
        lunaLikesFeedViewedByHercules.should.not.have.property('admins')

        const lunaLikesFeedViewedByMars = await funcTestHelper.getUserLikesFeed(lunaContext, marsContext)
        lunaLikesFeedViewedByMars.timelines.should.have.property('subscribers')
        lunaLikesFeedViewedByMars.should.have.property('subscribers')
        lunaLikesFeedViewedByMars.should.have.property('admins')

        const lunaCommentsFeedViewedByAnonymous = await funcTestHelper.getUserCommentsFeed(lunaContext)
        lunaCommentsFeedViewedByAnonymous.timelines.should.not.have.property('subscribers')
        lunaCommentsFeedViewedByAnonymous.should.not.have.property('subscribers')
        lunaCommentsFeedViewedByAnonymous.should.not.have.property('admins')

        const lunaCommentsFeedViewedByHercules = await funcTestHelper.getUserCommentsFeed(lunaContext, herculesContext)
        lunaCommentsFeedViewedByHercules.timelines.should.not.have.property('subscribers')
        lunaCommentsFeedViewedByHercules.should.not.have.property('subscribers')
        lunaCommentsFeedViewedByHercules.should.not.have.property('admins')

        const lunaCommentsFeedViewedByMars = await funcTestHelper.getUserCommentsFeed(lunaContext, marsContext)
        lunaCommentsFeedViewedByMars.timelines.should.have.property('subscribers')
        lunaCommentsFeedViewedByMars.should.have.property('subscribers')
        lunaCommentsFeedViewedByMars.should.have.property('admins')

        done()
      })

      it('should protect subscriptions of private user', function(done) {
        funcTestHelper.getSubscriptions(lunaContext.username, null, function(err, res) {
          _.isObject(err).should.be.true  // anonymous doesn't have access
          err.status.should.equal(403)

          funcTestHelper.getSubscriptions(lunaContext.username, herculesContext.authToken, function(err, res) {
            _.isObject(err).should.be.true  // hercules doesn't have access
            err.status.should.equal(403)

            funcTestHelper.getSubscriptions(lunaContext.username, marsContext.authToken, function(err, res) {
              _.isObject(err).should.be.false  // mars has access

              funcTestHelper.getSubscriptions(lunaContext.username, lunaContext.authToken, function (err, res) {
                _.isObject(err).should.be.false  // luna is an owner
                done()
              })
            })
          })
        })
      })
      it('should protect posts timeline', function(done) {
        funcTestHelper.getTimeline('/v1/timelines/' + lunaContext.user.username, herculesContext.authToken, function(err, res) {
          res.should.not.be.empty
          res.body.should.not.be.empty
          res.body.should.have.property('timelines')
          res.body.timelines.should.have.property('name')
          res.body.timelines.name.should.eql('Posts')
          res.body.timelines.should.not.have.property('posts')
          res.body.should.not.have.property('posts')

          funcTestHelper.getTimeline('/v1/timelines/' + lunaContext.user.username, lunaContext.authToken, function(err, res) {
            res.should.not.be.empty
            res.body.should.not.be.empty
            res.body.should.have.property('timelines')
            res.body.timelines.should.have.property('name')
            res.body.timelines.name.should.eql('Posts')
            res.body.timelines.should.have.property('posts')
            res.body.should.have.property('posts')
            done()
          })
        })
      })

      it('should be visible for auth users in likes timeline', function(done) {
        request
          .post(app.config.host + '/v1/posts/' + lunaContext.post.id + '/like')
          .send({ authToken: marsContext.authToken })
          .end(function(err, res) {
            funcTestHelper.getTimeline('/v1/timelines/' + marsContext.user.username + '/likes', lunaContext.authToken, function(err, res) {
              res.should.not.be.empty
              res.body.should.not.be.empty
              res.body.should.have.property('timelines')
              res.body.timelines.should.have.property('name')
              res.body.timelines.name.should.eql('Likes')
              res.body.timelines.should.have.property('posts')
              res.body.should.have.property('posts')
              done()
            })
          })
      })

      it('should protect likes timeline', function(done) {
        request
          .post(app.config.host + '/v1/posts/' + lunaContext.post.id + '/like')
          .send({ authToken: lunaContext.authToken })
          .end(function(err, res) {
            funcTestHelper.getTimeline('/v1/timelines/' + lunaContext.user.username + '/likes', herculesContext.authToken, function(err, res) {
              res.should.not.be.empty
              res.body.should.not.be.empty
              res.body.should.have.property('timelines')
              res.body.timelines.should.have.property('name')
              res.body.timelines.name.should.eql('Likes')
              res.body.timelines.should.not.have.property('posts')
              res.body.should.not.have.property('posts')

              done()
            })
          })
      })

      it('should be visible for auth users in comments timeline', function(done) {
        funcTestHelper.createComment('body', lunaContext.post.id, lunaContext.authToken, function(err, res) {
          funcTestHelper.getTimeline('/v1/timelines/' + lunaContext.user.username + '/comments', lunaContext.authToken, function(err, res) {
            res.should.not.be.empty
            res.body.should.not.be.empty
            res.body.should.have.property('timelines')
            res.body.timelines.should.have.property('name')
            res.body.timelines.name.should.eql('Comments')
            res.body.timelines.should.have.property('posts')
            res.body.should.have.property('posts')
            done()
          })
        })
      })

      it('should protect comments timeline', function(done) {
        funcTestHelper.createComment('body', lunaContext.post.id, lunaContext.authToken, function(err, res) {
          funcTestHelper.getTimeline('/v1/timelines/' + lunaContext.user.username + '/comments', herculesContext.authToken, function(err, res) {
            res.should.not.be.empty
            res.body.should.not.be.empty
            res.body.should.have.property('timelines')
            res.body.timelines.should.have.property('name')
            res.body.timelines.name.should.eql('Comments')
            res.body.timelines.should.not.have.property('posts')
            res.body.should.not.have.property('posts')
            done()
          })
        })
      })

      it('should not subscribe to private feed', function(done) {
        funcTestHelper.subscribeToCtx(herculesContext, lunaContext.username)(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(403)
          var error = JSON.parse(err.response.error.text)
          error.err.should.eql('You cannot subscribe to private feed')
          funcTestHelper.getTimeline('/v1/timelines/home', herculesContext.authToken, function(err, res) {
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

      it('should be able to send and receive subscription request', function(done) {
        request
          .post(app.config.host + '/v1/users/' + lunaContext.user.username + '/sendRequest')
          .send({ authToken: zeusContext.authToken,
                  '_method': 'post' })
          .end(function(err, res) {
            res.should.not.be.empty
            res.error.should.be.empty

            request
              .get(app.config.host + '/v1/users/whoami')
              .query({ authToken: lunaContext.authToken })
              .end(function(err, res) {
                // check there are subscription requests
                res.should.not.be.empty
                res.body.should.not.be.empty
                res.body.should.have.property('users')
                res.body.users.should.have.property('subscriptionRequests')
                res.body.users.subscriptionRequests.length.should.eql(1)
                res.body.should.have.property('requests')
                res.body.requests.length.should.eql(1)
                res.body.requests[0].id.should.eql(zeusContext.user.id)

                request
                  .get(app.config.host + '/v1/users/whoami')
                  .query({ authToken: zeusContext.authToken })
                  .end(function(err, res) {
                    // check there are pending requests
                    res.should.not.be.empty
                    res.body.should.not.be.empty
                    res.body.should.have.property('users')
                    res.body.users.should.have.property('pendingSubscriptionRequests')
                    res.body.users.pendingSubscriptionRequests.length.should.eql(1)
                    res.body.should.have.property('requests')
                    res.body.requests.length.should.eql(1)
                    res.body.requests[0].id.should.eql(lunaContext.user.id)
                    done()
                  })
              })
          })
      })

      it('that should be visible to subscribers only', function(done) {
        funcTestHelper.getTimeline('/v1/timelines/home', marsContext.authToken, function(err, res) {
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
          post.body.should.eql(lunaContext.post.body)
          // post should be visible to owner
          request
            .get(app.config.host + '/v1/posts/' + lunaContext.post.id)
            .query({ authToken: lunaContext.authToken })
            .end(function(err, res) {
              res.body.should.not.be.empty
              res.body.posts.body.should.eql(lunaContext.post.body)
              // post should be visible to subscribers
              request
                .get(app.config.host + '/v1/posts/' + lunaContext.post.id)
                .query({ authToken: lunaContext.authToken })
                .end(function(err, res) {
                  res.body.should.not.be.empty
                  res.body.posts.body.should.eql(lunaContext.post.body)
                  done()
                })
            })
        })
      })

      it('that should be visible to ex-subscribers', function(done) {
        funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, function(err, res) {
          res.should.not.be.empty
          res.body.should.not.be.empty
          res.body.should.have.property('timelines')
          res.body.timelines.should.have.property('name')
          res.body.timelines.name.should.eql('RiverOfNews')
          res.body.timelines.should.have.property('posts')
          res.body.should.have.property('posts')
          // post should not be visible to ex-subscribers
          request
            .get(app.config.host + '/v1/posts/' + lunaContext.post.id)
            .query({ authToken: zeusContext.authToken })
            .end(function(err, res) {
              res.body.should.not.be.empty
              res.body.posts.body.should.eql(lunaContext.post.body)
              done()
            })
        })
      })

      it('that should not be visible to users that are not subscribed', function(done) {
        request
          .get(app.config.host + '/v1/posts/' + lunaContext.post.id)
          .query({ authToken: herculesContext.authToken })
          .end(function(err, res) {
            err.should.not.be.empty
            err.status.should.eql(403)
            var error = JSON.parse(err.response.error.text)
            error.err.should.eql('Not found')
            done()
          })
      })
    })

    describe('when Luna goes private', function() {
      beforeEach(function(done) { funcTestHelper.createPost(lunaContext, 'Post body')(done) })
      beforeEach(function(done) { funcTestHelper.subscribeToCtx(marsContext, lunaContext.username)(done) })

      describe('with commented post', function() {
        beforeEach(function(done) {
          funcTestHelper.createComment('mars comment', lunaContext.post.id, marsContext.authToken, function(req, res) { done() })
        })
        beforeEach(function(done) {
          funcTestHelper.createComment('zeus comment', lunaContext.post.id, zeusContext.authToken, function(req, res) { done() })
        })
        beforeEach(() => funcTestHelper.goPrivate(lunaContext))

        it('should not influence how mars sees posts in his comments timeline', function(done) {
          funcTestHelper.getTimeline('/v1/timelines/' + marsContext.username + '/comments', marsContext.authToken, function(err, res) {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines.posts')
            done()
          })
        })

        it('should not influence how mars sees posts in his river of news', function(done) {
          funcTestHelper.getTimeline('/v1/timelines/home', marsContext.authToken, function(err, res) {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines.posts')
            done()
          })
        })

        it("should not show zeus her posts in mars's comments timeline", function(done) {
          funcTestHelper.getTimeline('/v1/timelines/' + marsContext.username + '/comments', zeusContext.authToken, function(err, res) {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines')
            res.body.timelines.should.not.have.property('posts')
            done()
          })
        })

        it("should not show her posts in mars's comments timeline to anonymous", function(done) {
          funcTestHelper.getTimeline('/v1/timelines/' + marsContext.username + '/comments', null, function(err, res) {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines')
            res.body.timelines.should.not.have.property('posts')
            done()
          })
        })

        it("should not show zeus her posts in zeus's comments timeline", function(done) {
          funcTestHelper.getTimeline('/v1/timelines/' + zeusContext.username + '/comments', zeusContext.authToken, function(err, res) {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines')
            res.body.timelines.should.not.have.property('posts')
            done()
          })
        })

        it("should not show zeus her posts in his river of news", function(done) {
          funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, function(err, res) {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines')
            res.body.timelines.should.not.have.property('posts')
            done()
          })
        })

        describe('when luna comes back to being public', function(done) {
          beforeEach(() => funcTestHelper.goPublic(lunaContext))

          it('should not influence how mars sees posts in his comments timeline', function(done) {
            funcTestHelper.getTimeline('/v1/timelines/' + marsContext.username + '/comments', marsContext.authToken, function(err, res) {
              _.isUndefined(res).should.be.false
              res.should.have.deep.property('body.timelines.posts')
              done()
            })
          })

          it('should not influence how mars sees posts in his river of news', function(done) {
            funcTestHelper.getTimeline('/v1/timelines/home', marsContext.authToken, function(err, res) {
              _.isUndefined(res).should.be.false
              res.should.have.deep.property('body.timelines.posts')
              done()
            })
          })

          it("should show zeus her posts in mars's comments timeline", function(done) {
            funcTestHelper.getTimeline('/v1/timelines/' + marsContext.username + '/comments', zeusContext.authToken, function(err, res) {
              _.isUndefined(res).should.be.false
              res.should.have.deep.property('body.timelines.posts')
              res.body.timelines.posts.length.should.eql(1)
              res.body.should.have.property('posts')
              res.body.posts.length.should.eql(1)
              res.body.posts[0].body.should.eql(lunaContext.post.body)
              done()
            })
          })

          it("should show zeus her posts in zeus's comments timeline", function(done) {
            funcTestHelper.getTimeline('/v1/timelines/' + zeusContext.username + '/comments', zeusContext.authToken, function(err, res) {
              _.isUndefined(res).should.be.false
              res.should.have.deep.property('body.timelines.posts')
              res.body.timelines.posts.length.should.eql(1)
              res.body.should.have.property('posts')
              res.body.posts.length.should.eql(1)
              res.body.posts[0].body.should.eql(lunaContext.post.body)
              done()
            })
          })

          it("should show zeus her posts in his river of news", function(done) {
            funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, function(err, res) {
              _.isUndefined(res).should.be.false
              res.should.have.deep.property('body.timelines.posts')
              res.body.timelines.posts.length.should.eql(1)
              res.body.should.have.property('posts')
              res.body.posts.length.should.eql(1)
              res.body.posts[0].body.should.eql(lunaContext.post.body)
              done()
            })
          })
        })
      })

      describe('with liked post', function() {
        beforeEach(() => funcTestHelper.like(lunaContext.post.id, marsContext.authToken))
        beforeEach(() => funcTestHelper.like(lunaContext.post.id, zeusContext.authToken))
        beforeEach(() => funcTestHelper.goPrivate(lunaContext))

        it('should not influence how mars sees posts in his likes timeline', function(done) {
          funcTestHelper.getTimeline('/v1/timelines/' + marsContext.username + '/likes', marsContext.authToken, function(err, res) {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines.posts')
            done()
          })
        })

        it('should not influence how mars sees posts in his river of news', function(done) {
          funcTestHelper.getTimeline('/v1/timelines/home', marsContext.authToken, function(err, res) {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines.posts')
            done()
          })
        })

        it("should not show zeus her posts in mars's likes timeline", function(done) {
          funcTestHelper.getTimeline('/v1/timelines/' + marsContext.username + '/likes', zeusContext.authToken, function(err, res) {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines')
            res.body.timelines.should.not.have.property('posts')
            done()
          })
        })

        it("should not show her posts in mars's likes timeline to anonymous", function(done) {
          funcTestHelper.getTimeline('/v1/timelines/' + marsContext.username + '/likes', null, function(err, res) {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines')
            res.body.timelines.should.not.have.property('posts')
            done()
          })
        })

        it("should not show zeus her posts in zeus's likes timeline", function(done) {
          funcTestHelper.getTimeline('/v1/timelines/' + zeusContext.username + '/likes', zeusContext.authToken, function(err, res) {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines')
            res.body.timelines.should.not.have.property('posts')
            done()
          })
        })

        it("should not show zeus her posts in his river of news", function(done) {
          funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, function(err, res) {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines')
            res.body.timelines.should.not.have.property('posts')
            done()
          })
        })

        describe('when luna comes back to being public', function() {
          beforeEach(() => funcTestHelper.goPublic(lunaContext))

          it('should not influence how mars sees posts in his likes timeline', function(done) {
            funcTestHelper.getTimeline('/v1/timelines/' + marsContext.username + '/likes', marsContext.authToken, function(err, res) {
              _.isUndefined(res).should.be.false
              res.should.have.deep.property('body.timelines.posts')
              done()
            })
          })

          it('should not influence how mars sees posts in his river of news', function(done) {
            funcTestHelper.getTimeline('/v1/timelines/home', marsContext.authToken, function(err, res) {
              _.isUndefined(res).should.be.false
              res.should.have.deep.property('body.timelines.posts')
              done()
            })
          })

          it("should show zeus her posts in mars's likes timeline", function(done) {
            funcTestHelper.getTimeline('/v1/timelines/' + marsContext.username + '/likes', zeusContext.authToken, function (err, res) {
              _.isUndefined(res).should.be.false
              res.should.have.deep.property('body.timelines.posts')
              res.body.timelines.posts.length.should.eql(1)
              res.body.should.have.property('posts')
              res.body.posts.length.should.eql(1)
              res.body.posts[0].body.should.eql(lunaContext.post.body)
              done()
            })
          })

          it("should show zeus her posts in zeus's likes timeline", function(done) {
            funcTestHelper.getTimeline('/v1/timelines/' + zeusContext.username + '/likes', zeusContext.authToken, function (err, res) {
              _.isUndefined(res).should.be.false
              res.should.have.deep.property('body.timelines.posts')
              res.body.timelines.posts.length.should.eql(1)
              res.body.should.have.property('posts')
              res.body.posts.length.should.eql(1)
              res.body.posts[0].body.should.eql(lunaContext.post.body)
              done()
            })
          })

          it("should show zeus her posts in his river of news", function(done) {
            funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, function (err, res) {
              _.isUndefined(res).should.be.false
              res.should.have.deep.property('body.timelines.posts')
              res.body.timelines.posts.length.should.eql(1)
              res.body.should.have.property('posts')
              res.body.posts.length.should.eql(1)
              res.body.posts[0].body.should.eql(lunaContext.post.body)
              done()
            })
          })
        })
      })
    })

    describe('can go private and unsubscribe followers', function() {
      beforeEach(function(done) { funcTestHelper.createPost(lunaContext, 'Post body')(done) })
      beforeEach(function(done) { funcTestHelper.subscribeToCtx(marsContext, lunaContext.username)(done) })
      beforeEach(function(done) { funcTestHelper.createComment('body', lunaContext.post.id, zeusContext.authToken, done) })
      beforeEach(() => funcTestHelper.goPrivate(lunaContext))

      it('should be visible to already subscribed users', function(done) {
        request
          .get(app.config.host + '/v1/users/' + marsContext.username + '/subscriptions')
          .query({ authToken: marsContext.authToken })
          .end(function(err, res) {
            res.body.should.not.be.empty
            res.body.should.have.property('subscriptions')
            res.body.subscriptions.length.should.eql(3)
            done()
          })
      })

      it('should be visible to mutual friends', function(done) {
        request
          .post(app.config.host + '/v1/users/' + lunaContext.user.username + '/sendRequest')
          .send({ authToken: marsContext.authToken,
                  '_method': 'post' })
          .end(function(err, res) {
            request
              .post(app.config.host + '/v1/users/acceptRequest/' + marsContext.user.username)
              .send({ authToken: lunaContext.authToken,
                      '_method': 'post' })
              .end(function(err, res) {
                request
                  .get(app.config.host + '/v1/users/' + marsContext.username + '/subscriptions')
                  .query({ authToken: marsContext.authToken })
                  .end(function(err, res) {
                    res.body.should.not.be.empty
                    res.body.should.have.property('subscriptions')
                    res.body.subscriptions.should.not.be.empty
                    res.body.subscriptions.length.should.eql(3)
                    done()
                  })
              })
          })
      })

      it('should be visible to subscribers', function(done) {
        request
          .get(app.config.host + '/v1/users/' + marsContext.username + '/subscriptions')
          .query({ authToken: marsContext.authToken })
          .end(function(err, res) {
            res.body.should.not.be.empty
            res.body.should.have.property('subscriptions')
            res.body.subscriptions.should.not.be.empty
            res.body.subscriptions.length.should.eql(3)
            done()
          })
      })
    })
  })

  describe('Checking, that private posts are correctly propagated', () => {
    let lunaContext = {}
      , marsContext = {}
      , zeusContext = {}

    beforeEach(funcTestHelper.createUserCtx(lunaContext, 'luna', 'pw'))
    beforeEach(funcTestHelper.createUserCtx(marsContext, 'mars', 'pw'))
    beforeEach(funcTestHelper.createUserCtx(zeusContext, 'zeus', 'pw'))
    beforeEach(() => funcTestHelper.mutualSubscriptions([lunaContext, marsContext, zeusContext]))
    beforeEach(() => funcTestHelper.goPrivate(lunaContext))

    describe('given we have 2 posts by luna', () => {
      let post1, post2

      beforeEach(async () => {post1 = await funcTestHelper.createAndReturnPost(lunaContext, 'post 1')})
      beforeEach(async () => {post2 = await funcTestHelper.createAndReturnPost(lunaContext, 'post 2')})

      it('should bump posts correctly, if someone comments them', async () => {
        await funcTestHelper.createCommentAsync(marsContext, post1.id, 'comment1')

        let marsRiver = await funcTestHelper.getRiverOfNews(marsContext);
        marsRiver.timelines.posts[0].should.equal(post1.id, 'order of posts in incorrect')

        let zeusRiver = await funcTestHelper.getRiverOfNews(zeusContext);
        zeusRiver.timelines.posts[0].should.equal(post1.id, 'order of posts in incorrect')
      })

      it('should add post to "my discussions" after comment', async () => {
        await funcTestHelper.createCommentAsync(marsContext, post1.id, 'comment1')

        let marsDiscussions = await funcTestHelper.getMyDiscussions(marsContext);
        marsDiscussions.timelines.should.have.property('posts')
        marsDiscussions.timelines.posts.should.include(post1.id, 'commented post is not in "my discussions"')
        marsDiscussions.timelines.posts[0].should.equal(post1.id, 'order of posts in incorrect')
      })

      it('should add post to "my discussions" after like', async () => {
        await funcTestHelper.like(post1.id, marsContext.authToken)

        let marsDiscussions = await funcTestHelper.getMyDiscussions(marsContext);
        marsDiscussions.timelines.should.have.property('posts')
        marsDiscussions.timelines.posts.should.include(post1.id, 'liked post is not in "my discussions"')
        marsDiscussions.timelines.posts[0].should.equal(post1.id, 'order of posts in incorrect')
      })
    })
  })
})
