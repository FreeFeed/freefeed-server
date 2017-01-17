/* eslint-env node, mocha */
/* global $pg_database */
import request from 'superagent'
import _ from 'lodash'
import knexCleaner from 'knex-cleaner'

import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub } from '../../app/models'
import * as funcTestHelper from './functional_test_helper'


describe('Privates', () => {
  let app

  before(async () => {
    app = await getSingleton()
    PubSub.setPublisher(new DummyPublisher())
  })

  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  describe('user Luna and user Mars', () => {
    let lunaContext = {}
    let marsContext = {}
    let zeusContext = {}

    beforeEach(async () => {
      [lunaContext, marsContext, zeusContext] = await Promise.all([
        funcTestHelper.createUserAsync('luna', 'pw'),
        funcTestHelper.createUserAsync('mars', 'pw'),
        funcTestHelper.createUserAsync('zeus', 'pw')
      ])
    })

    describe('publish private post to public feed', () => {
      const group = 'group'

      beforeEach(async () => {
        await Promise.all([
          funcTestHelper.mutualSubscriptions([marsContext, lunaContext]),
          funcTestHelper.createGroupAsync(lunaContext, group)
        ])

        await funcTestHelper.subscribeToAsync(zeusContext, { username: group })
      })


      it('should send private post to public feed', (done) => {
        const post = 'post'
        request
          .post(`${app.context.config.host}/v1/posts`)
          .send({ post: { body: post }, meta: { feeds: [group, lunaContext.user.username] }, authToken: lunaContext.authToken })
          .end(() => {
            funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, (err, res) => {
              _.isUndefined(res).should.be.false
              res.body.should.not.be.empty
              res.body.should.have.property('timelines')
              res.body.timelines.should.have.property('name')
              res.body.timelines.name.should.eql('RiverOfNews')
              res.body.timelines.should.have.property('posts')
              res.body.timelines.posts.length.should.eql(1)
              res.body.should.have.property('posts')
              res.body.posts.length.should.eql(1)
              const _post = res.body.posts[0]
              _post.body.should.eql(post)
              request
                .post(`${app.context.config.host}/v1/posts/${_post.id}/like`)
                .send({ authToken: zeusContext.authToken })
                .end(() => {
                  funcTestHelper.getTimeline(`/v1/timelines/${zeusContext.user.username}/likes`, zeusContext.authToken, (err, res) => {
                    _.isUndefined(res).should.be.false
                    res.body.should.not.be.empty
                    res.body.should.have.property('timelines')
                    res.body.timelines.should.have.property('name')
                    res.body.timelines.name.should.eql('Likes')
                    res.body.timelines.should.have.property('posts')
                    res.body.timelines.posts.length.should.eql(1)
                    res.body.should.have.property('posts')
                    res.body.posts.length.should.eql(1)
                    const _post = res.body.posts[0]
                    _post.body.should.eql(post)
                    request
                      .get(`${app.context.config.host}/v1/posts/${_post.id}`)
                      .query({ authToken: zeusContext.authToken })
                      .end((err, res) => {
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

    describe('can protect protected users', () => {
      beforeEach(async () => {
        await funcTestHelper.goProtected(lunaContext)
      });

      it('should protect subscribers of protected user', async () => {
        const lunaSubscribersViewedByAnonymous = await funcTestHelper.getSubscribersAsync(lunaContext.username)
        lunaSubscribersViewedByAnonymous.status.should.equal(403)
        const viewedByAnonymous = await lunaSubscribersViewedByAnonymous.json()
        viewedByAnonymous.should.have.property('err')  // anonymous doesn't have access

        const lunaSubscribersViewedByMars = await funcTestHelper.getSubscribersAsync(lunaContext.username, marsContext)
        const viewedByMars = await lunaSubscribersViewedByMars.json()
        viewedByMars.should.not.have.property('err')  // mars has access
      });

      it('should protect subscriptions of protected user', async () => {
        const lunaSubscriptionsViewedByAnonymous = await funcTestHelper.getSubscriptionsAsync(lunaContext.username)
        lunaSubscriptionsViewedByAnonymous.status.should.equal(403)
        const viewedByAnonymous = await lunaSubscriptionsViewedByAnonymous.json()
        viewedByAnonymous.should.have.property('err')  // anonymous doesn't have access

        const lunaSubscriptionsViewedByMars = await funcTestHelper.getSubscriptionsAsync(lunaContext.username, marsContext)
        const viewedByMars = await lunaSubscriptionsViewedByMars.json()
        viewedByMars.should.not.have.property('err')  // mars has access
      });
    });

    describe('can protect private posts', () => {
      let herculesContext = {}
      let post = {}

      beforeEach(async () => {
        [,, herculesContext] = await Promise.all([
          funcTestHelper.mutualSubscriptions([marsContext, lunaContext]),
          funcTestHelper.subscribeToAsync(zeusContext, lunaContext),
          funcTestHelper.createUserAsync('hercules', 'pw')
        ])

        await funcTestHelper.goPrivate(lunaContext)
        post = await funcTestHelper.createAndReturnPost(lunaContext, 'Post body')
      })

      describe('and manage subscription requests', () => {
        beforeEach(async () => {
          await funcTestHelper.sendRequestToSubscribe(zeusContext, lunaContext)
        })

        it('should reject subscription request after ban', (done) => {
          request
            .post(`${app.context.config.host}/v1/users/${zeusContext.user.username}/ban`)
            .send({ authToken: lunaContext.authToken })
            .end(() => {
              request
                .get(`${app.context.config.host}/v1/users/whoami`)
                .query({ authToken: lunaContext.authToken })
                .end((err, res) => {
                  res.should.not.be.empty
                  res.body.should.not.be.empty
                  res.body.should.have.property('users')
                  res.body.users.should.not.have.property('subscriptionRequests')
                  done()
                })
            })
        })

        it('should not allow banned user to send subscription request', (done) => {
          request
            .post(`${app.context.config.host}/v1/users/${zeusContext.user.username}/ban`)
            .send({ authToken: lunaContext.authToken })
            .end(() => {
              request
                .post(`${app.context.config.host}/v1/users/${lunaContext.user.username}/sendRequest`)
                .send({
                  authToken: zeusContext.authToken,
                  '_method': 'post'
                })
                .end((err, res) => {
                  res.should.not.be.empty
                  res.body.err.should.not.be.empty
                  res.body.err.should.eql('Invalid')
                  request
                    .get(`${app.context.config.host}/v1/users/whoami`)
                    .query({ authToken: lunaContext.authToken })
                    .end((err, res) => {
                      res.should.not.be.empty
                      res.body.should.not.be.empty
                      res.body.should.have.property('users')
                      res.body.users.should.not.have.property('subscriptionRequests')
                      done()
                    })
                })
            })
        })

        it('should show liked post per context', (done) => {
          request
            .post(`${app.context.config.host}/v1/users/acceptRequest/${zeusContext.user.username}`)
            .send({
              authToken: lunaContext.authToken,
              '_method': 'post'
            })
            .end(() => {
              request
                .post(`${app.context.config.host}/v1/posts/${post.id}/like`)
                .send({ authToken: marsContext.authToken })
                .end(() => {
                  funcTestHelper.getTimeline(`/v1/timelines/${marsContext.user.username}/likes`, marsContext.authToken, (err, res) => {
                    res.body.should.have.property('posts')

                    funcTestHelper.getTimeline(`/v1/timelines/${marsContext.user.username}/likes`, zeusContext.authToken, (err, res) => {
                      // view mars/likes timeline as zeus
                      res.body.should.have.property('posts')

                      done()
                    })
                  })
                })
            })
        })

        it('should show liked post per context', (done) => {
          request
            .post(`${app.context.config.host}/v1/users/acceptRequest/${zeusContext.user.username}`)
            .send({
              authToken: lunaContext.authToken,
              '_method': 'post'
            })
            .end(() => {
              funcTestHelper.createComment('comment', post.id, marsContext.authToken, () => {
                funcTestHelper.getTimeline(`/v1/timelines/${marsContext.user.username}/comments`, marsContext.authToken, (err, res) => {
                  res.body.should.have.property('posts')

                  funcTestHelper.getTimeline(`/v1/timelines/${marsContext.user.username}/comments`, zeusContext.authToken, (err, res) => {
                    // view mars/comments timeline as zeus
                    res.body.should.have.property('posts')

                    done()
                  })
                })
              })
            })
        })

        it('should not be accepted by invalid user', (done) => {
          request
            .post(`${app.context.config.host}/v1/users/acceptRequest/${zeusContext.user.username}`)
            .send({
              authToken: zeusContext.authToken,
              '_method': 'post'
            })
            .end((err) => {
              err.should.not.be.empty
              err.status.should.eql(500)
              done()
            })
        })

        it('should be able to accept', (done) => {
          request
            .post(`${app.context.config.host}/v1/users/acceptRequest/${zeusContext.user.username}`)
            .send({
              authToken: lunaContext.authToken,
              '_method': 'post'
            })
            .end((err, res) => {
              res.should.not.be.empty
              res.error.should.be.empty

              request
                .get(`${app.context.config.host}/v1/users/whoami`)
                .query({ authToken: lunaContext.authToken })
                .end((err, res) => {
                  // check there are no subscription requests
                  res.should.not.be.empty
                  res.body.should.not.be.empty
                  res.body.should.have.property('users')
                  res.body.users.should.not.have.property('subscriptionRequests')
                  res.body.should.not.have.property('requests')

                  request
                    .get(`${app.context.config.host}/v1/users/whoami`)
                    .query({ authToken: lunaContext.authToken })
                    .end((err, res) => {
                      // check there are no pending requests
                      res.should.not.be.empty
                      res.body.should.not.be.empty
                      res.body.should.have.property('users')
                      res.body.users.should.not.have.property('pendingSubscriptionRequests')
                      res.body.should.not.have.property('requests')

                      funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, (err, res) => {
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
                        const post = res.body.posts[0]
                        post.body.should.eql(post.body)
                        done()
                      })
                    })
                })
            })
        })

        it('should be able to reject', (done) => {
          request
            .post(`${app.context.config.host}/v1/users/${lunaContext.user.username}/sendRequest`)
            .send({
              authToken: herculesContext.authToken,
              '_method': 'post'
            })
            .end(() => {
              request
                .post(`${app.context.config.host}/v1/users/rejectRequest/${herculesContext.user.username}`)
                .send({
                  authToken: lunaContext.authToken,
                  '_method': 'post'
                })
                .end((err, res) => {
                  res.should.not.be.empty
                  res.error.should.be.empty

                  request
                    .get(`${app.context.config.host}/v1/users/whoami`)
                    .query({ authToken: lunaContext.authToken })
                    .end((err, res) => {
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
                        .get(`${app.context.config.host}/v1/users/whoami`)
                        .query({ authToken: herculesContext.authToken })
                        .end((err, res) => {
                          res.should.not.be.empty
                          res.body.should.not.be.empty
                          res.body.should.have.property('users')
                          res.body.users.should.not.have.property('pendingSubscriptionRequests')
                          res.body.should.not.have.property('requests')

                          funcTestHelper.getTimeline('/v1/timelines/home', herculesContext.authToken, (err, res) => {
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

      xit('should protect user stats', (done) => {
        funcTestHelper.getTimeline(`/v1/timelines/${lunaContext.user.username}`, herculesContext.authToken, (err, res) => {
          res.should.not.be.empty
          res.body.should.not.be.empty
          res.body.should.have.property('users')
          res.body.users[0].should.not.have.property('statistics')

          funcTestHelper.getTimeline(`/v1/timelines/${lunaContext.user.username}`, lunaContext.authToken, (err, res) => {
            res.should.not.be.empty
            res.body.should.not.be.empty
            res.body.should.have.property('users')
            res.body.users[0].should.have.property('statistics')
            done()
          })
        })
      })

      it('should protect subscribers of private user', async () => {
        const lunaSubscribersViewedByAnonymous = await funcTestHelper.getSubscribersAsync(lunaContext.username)
        lunaSubscribersViewedByAnonymous.status.should.equal(403)
        const viewedByAnonymous = await lunaSubscribersViewedByAnonymous.json()
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

        const lunaFeedViewedByLuna = await funcTestHelper.getUserFeed(lunaContext, lunaContext)
        lunaFeedViewedByLuna.timelines.should.have.property('subscribers')
        lunaFeedViewedByLuna.should.have.property('subscribers')
        lunaFeedViewedByLuna.should.have.property('admins')

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

        const lunaLikesFeedViewedByLuna = await funcTestHelper.getUserLikesFeed(lunaContext, lunaContext)
        lunaLikesFeedViewedByLuna.timelines.should.have.property('subscribers')
        lunaLikesFeedViewedByLuna.should.have.property('subscribers')
        lunaLikesFeedViewedByLuna.should.have.property('admins')

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

        const lunaCommentsFeedViewedByLuna = await funcTestHelper.getUserCommentsFeed(lunaContext, lunaContext)
        lunaCommentsFeedViewedByLuna.timelines.should.have.property('subscribers')
        lunaCommentsFeedViewedByLuna.should.have.property('subscribers')
        lunaCommentsFeedViewedByLuna.should.have.property('admins')
      });

      it('should protect subscriptions of private user', (done) => {
        funcTestHelper.getSubscriptions(lunaContext.username, null, (err) => {
          _.isObject(err).should.be.true  // anonymous doesn't have access
          err.status.should.equal(403)

          funcTestHelper.getSubscriptions(lunaContext.username, herculesContext.authToken, (err) => {
            _.isObject(err).should.be.true  // hercules doesn't have access
            err.status.should.equal(403)

            funcTestHelper.getSubscriptions(lunaContext.username, marsContext.authToken, (err) => {
              _.isObject(err).should.be.false  // mars has access

              funcTestHelper.getSubscriptions(lunaContext.username, lunaContext.authToken, (err) => {
                _.isObject(err).should.be.false  // luna is an owner
                done()
              })
            })
          })
        })
      })
      it('should protect posts timeline', (done) => {
        funcTestHelper.getTimeline(`/v1/timelines/${lunaContext.user.username}`, herculesContext.authToken, (err, res) => {
          res.should.not.be.empty
          res.body.should.not.be.empty
          res.body.should.have.property('timelines')
          res.body.timelines.should.have.property('name')
          res.body.timelines.name.should.eql('Posts')
          res.body.timelines.should.not.have.property('posts')
          res.body.should.not.have.property('posts')

          funcTestHelper.getTimeline(`/v1/timelines/${lunaContext.user.username}`, lunaContext.authToken, (err, res) => {
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

      it('should be visible for auth users in likes timeline', (done) => {
        request
          .post(`${app.context.config.host}/v1/posts/${post.id}/like`)
          .send({ authToken: marsContext.authToken })
          .end(() => {
            funcTestHelper.getTimeline(`/v1/timelines/${marsContext.user.username}/likes`, lunaContext.authToken, (err, res) => {
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

      it('should protect likes timeline', (done) => {
        request
          .post(`${app.context.config.host}/v1/posts/${post.id}/like`)
          .send({ authToken: lunaContext.authToken })
          .end(() => {
            funcTestHelper.getTimeline(`/v1/timelines/${lunaContext.user.username}/likes`, herculesContext.authToken, (err, res) => {
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

      it('should be visible for auth users in comments timeline', (done) => {
        funcTestHelper.createComment('body', post.id, lunaContext.authToken, () => {
          funcTestHelper.getTimeline(`/v1/timelines/${lunaContext.user.username}/comments`, lunaContext.authToken, (err, res) => {
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

      it('should protect comments timeline', (done) => {
        funcTestHelper.createComment('body', post.id, lunaContext.authToken, () => {
          funcTestHelper.getTimeline(`/v1/timelines/${lunaContext.user.username}/comments`, herculesContext.authToken, (err, res) => {
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

      it('should not subscribe to private feed', (done) => {
        funcTestHelper.subscribeToCtx(herculesContext, lunaContext.username)((err) => {
          err.should.not.be.empty
          err.status.should.eql(403)
          const error = JSON.parse(err.response.error.text)
          error.err.should.eql('You cannot subscribe to private feed')
          funcTestHelper.getTimeline('/v1/timelines/home', herculesContext.authToken, (err, res) => {
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

      it('should be able to send and receive subscription request', (done) => {
        request
          .post(`${app.context.config.host}/v1/users/${lunaContext.user.username}/sendRequest`)
          .send({
            authToken: zeusContext.authToken,
            '_method': 'post'
          })
          .end((err, res) => {
            res.should.not.be.empty
            res.error.should.be.empty

            request
              .get(`${app.context.config.host}/v1/users/whoami`)
              .query({ authToken: lunaContext.authToken })
              .end((err, res) => {
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
                  .get(`${app.context.config.host}/v1/users/whoami`)
                  .query({ authToken: zeusContext.authToken })
                  .end((err, res) => {
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

      it('that should be visible to subscribers only', (done) => {
        funcTestHelper.getTimeline('/v1/timelines/home', marsContext.authToken, (err, res) => {
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
          post.body.should.eql(post.body)
          // post should be visible to owner
          request
            .get(`${app.context.config.host}/v1/posts/${post.id}`)
            .query({ authToken: lunaContext.authToken })
            .end((err, res) => {
              res.body.should.not.be.empty
              res.body.posts.body.should.eql(post.body)
              // post should be visible to subscribers
              request
                .get(`${app.context.config.host}/v1/posts/${post.id}`)
                .query({ authToken: lunaContext.authToken })
                .end((err, res) => {
                  res.body.should.not.be.empty
                  res.body.posts.body.should.eql(post.body)
                  done()
                })
            })
        })
      })

      it('that should be visible to ex-subscribers', (done) => {
        funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, (err, res) => {
          res.should.not.be.empty
          res.body.should.not.be.empty
          res.body.should.have.property('timelines')
          res.body.timelines.should.have.property('name')
          res.body.timelines.name.should.eql('RiverOfNews')
          res.body.timelines.should.have.property('posts')
          res.body.should.have.property('posts')
          // post should not be visible to ex-subscribers
          request
            .get(`${app.context.config.host}/v1/posts/${post.id}`)
            .query({ authToken: zeusContext.authToken })
            .end((err, res) => {
              res.body.should.not.be.empty
              res.body.posts.body.should.eql(post.body)
              done()
            })
        })
      })

      it('that should not be visible to users that are not subscribed', (done) => {
        request
          .get(`${app.context.config.host}/v1/posts/${post.id}`)
          .query({ authToken: herculesContext.authToken })
          .end((err) => {
            err.should.not.be.empty
            err.status.should.eql(403)
            const error = JSON.parse(err.response.error.text)
            error.err.should.eql('Not found')
            done()
          })
      })
    })

    describe('when Luna goes private', () => {
      let post = {}
      beforeEach(async () => {
        post = await funcTestHelper.createAndReturnPost(lunaContext, 'Post body')
        await funcTestHelper.subscribeToAsync(marsContext, lunaContext)
      })

      describe('with commented post', () => {
        beforeEach((done) => {
          funcTestHelper.createComment('mars comment', post.id, marsContext.authToken, () => { done() })
        })
        beforeEach((done) => {
          funcTestHelper.createComment('zeus comment', post.id, zeusContext.authToken, () => { done() })
        })
        beforeEach(() => funcTestHelper.goPrivate(lunaContext))

        it('should not influence how mars sees posts in his comments timeline', (done) => {
          funcTestHelper.getTimeline(`/v1/timelines/${marsContext.username}/comments`, marsContext.authToken, (err, res) => {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines.posts')
            done()
          })
        })

        it('should not influence how mars sees posts in his river of news', (done) => {
          funcTestHelper.getTimeline('/v1/timelines/home', marsContext.authToken, (err, res) => {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines.posts')
            done()
          })
        })

        it("should not show zeus her posts in mars's comments timeline", (done) => {
          funcTestHelper.getTimeline(`/v1/timelines/${marsContext.username}/comments`, zeusContext.authToken, (err, res) => {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines')
            res.body.timelines.should.not.have.property('posts')
            done()
          })
        })

        it("should not show her posts in mars's comments timeline to anonymous", (done) => {
          funcTestHelper.getTimeline(`/v1/timelines/${marsContext.username}/comments`, null, (err, res) => {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines')
            res.body.timelines.should.not.have.property('posts')
            done()
          })
        })

        it("should not show zeus her posts in zeus's comments timeline", (done) => {
          funcTestHelper.getTimeline(`/v1/timelines/${zeusContext.username}/comments`, zeusContext.authToken, (err, res) => {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines')
            res.body.timelines.should.not.have.property('posts')
            done()
          })
        })

        it('should not show zeus her posts in his river of news', (done) => {
          funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, (err, res) => {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines')
            res.body.timelines.should.not.have.property('posts')
            done()
          })
        })

        describe('when luna comes back to being public', () => {
          beforeEach(() => funcTestHelper.goPublic(lunaContext))

          it('should not influence how mars sees posts in his comments timeline', (done) => {
            funcTestHelper.getTimeline(`/v1/timelines/${marsContext.username}/comments`, marsContext.authToken, (err, res) => {
              _.isUndefined(res).should.be.false
              res.should.have.deep.property('body.timelines.posts')
              done()
            })
          })

          it('should not influence how mars sees posts in his river of news', (done) => {
            funcTestHelper.getTimeline('/v1/timelines/home', marsContext.authToken, (err, res) => {
              _.isUndefined(res).should.be.false
              res.should.have.deep.property('body.timelines.posts')
              done()
            })
          })

          it("should show zeus her posts in mars's comments timeline", (done) => {
            funcTestHelper.getTimeline(`/v1/timelines/${marsContext.username}/comments`, zeusContext.authToken, (err, res) => {
              _.isUndefined(res).should.be.false
              res.should.have.deep.property('body.timelines.posts')
              res.body.timelines.posts.length.should.eql(1)
              res.body.should.have.property('posts')
              res.body.posts.length.should.eql(1)
              res.body.posts[0].body.should.eql(post.body)
              done()
            })
          })

          it("should show zeus her posts in zeus's comments timeline", (done) => {
            funcTestHelper.getTimeline(`/v1/timelines/${zeusContext.username}/comments`, zeusContext.authToken, (err, res) => {
              _.isUndefined(res).should.be.false
              res.should.have.deep.property('body.timelines.posts')
              res.body.timelines.posts.length.should.eql(1)
              res.body.should.have.property('posts')
              res.body.posts.length.should.eql(1)
              res.body.posts[0].body.should.eql(post.body)
              done()
            })
          })

          it('should show zeus her posts in his river of news', (done) => {
            funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, (err, res) => {
              _.isUndefined(res).should.be.false
              res.should.have.deep.property('body.timelines.posts')
              res.body.timelines.posts.length.should.eql(1)
              res.body.should.have.property('posts')
              res.body.posts.length.should.eql(1)
              res.body.posts[0].body.should.eql(post.body)
              done()
            })
          })
        })
      })

      describe('with liked post', () => {
        beforeEach(() => funcTestHelper.like(post.id, marsContext.authToken))
        beforeEach(() => funcTestHelper.like(post.id, zeusContext.authToken))
        beforeEach(() => funcTestHelper.goPrivate(lunaContext))

        it('should not influence how mars sees posts in his likes timeline', (done) => {
          funcTestHelper.getTimeline(`/v1/timelines/${marsContext.username}/likes`, marsContext.authToken, (err, res) => {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines.posts')
            done()
          })
        })

        it('should not influence how mars sees posts in his river of news', (done) => {
          funcTestHelper.getTimeline('/v1/timelines/home', marsContext.authToken, (err, res) => {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines.posts')
            done()
          })
        })

        it("should not show zeus her posts in mars's likes timeline", (done) => {
          funcTestHelper.getTimeline(`/v1/timelines/${marsContext.username}/likes`, zeusContext.authToken, (err, res) => {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines')
            res.body.timelines.should.not.have.property('posts')
            done()
          })
        })

        it("should not show her posts in mars's likes timeline to anonymous", (done) => {
          funcTestHelper.getTimeline(`/v1/timelines/${marsContext.username}/likes`, null, (err, res) => {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines')
            res.body.timelines.should.not.have.property('posts')
            done()
          })
        })

        it("should not show zeus her posts in zeus's likes timeline", (done) => {
          funcTestHelper.getTimeline(`/v1/timelines/${zeusContext.username}/likes`, zeusContext.authToken, (err, res) => {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines')
            res.body.timelines.should.not.have.property('posts')
            done()
          })
        })

        it('should not show zeus her posts in his river of news', (done) => {
          funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, (err, res) => {
            _.isUndefined(res).should.be.false
            res.should.have.deep.property('body.timelines')
            res.body.timelines.should.not.have.property('posts')
            done()
          })
        })

        describe('when luna comes back to being public', () => {
          beforeEach(() => funcTestHelper.goPublic(lunaContext))

          it('should not influence how mars sees posts in his likes timeline', (done) => {
            funcTestHelper.getTimeline(`/v1/timelines/${marsContext.username}/likes`, marsContext.authToken, (err, res) => {
              _.isUndefined(res).should.be.false
              res.should.have.deep.property('body.timelines.posts')
              done()
            })
          })

          it('should not influence how mars sees posts in his river of news', (done) => {
            funcTestHelper.getTimeline('/v1/timelines/home', marsContext.authToken, (err, res) => {
              _.isUndefined(res).should.be.false
              res.should.have.deep.property('body.timelines.posts')
              done()
            })
          })

          it("should show zeus her posts in mars's likes timeline", (done) => {
            funcTestHelper.getTimeline(`/v1/timelines/${marsContext.username}/likes`, zeusContext.authToken, (err, res) => {
              _.isUndefined(res).should.be.false
              res.should.have.deep.property('body.timelines.posts')
              res.body.timelines.posts.length.should.eql(1)
              res.body.should.have.property('posts')
              res.body.posts.length.should.eql(1)
              res.body.posts[0].body.should.eql(post.body)
              done()
            })
          })

          it("should show zeus her posts in zeus's likes timeline", (done) => {
            funcTestHelper.getTimeline(`/v1/timelines/${zeusContext.username}/likes`, zeusContext.authToken, (err, res) => {
              _.isUndefined(res).should.be.false
              res.should.have.deep.property('body.timelines.posts')
              res.body.timelines.posts.length.should.eql(1)
              res.body.should.have.property('posts')
              res.body.posts.length.should.eql(1)
              res.body.posts[0].body.should.eql(post.body)
              done()
            })
          })

          it('should show zeus her posts in his river of news', (done) => {
            funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, (err, res) => {
              _.isUndefined(res).should.be.false
              res.should.have.deep.property('body.timelines.posts')
              res.body.timelines.posts.length.should.eql(1)
              res.body.should.have.property('posts')
              res.body.posts.length.should.eql(1)
              res.body.posts[0].body.should.eql(post.body)
              done()
            })
          })
        })
      })
    })

    describe('can go private and unsubscribe followers', () => {
      beforeEach(async () => {
        const post = await funcTestHelper.createAndReturnPost(lunaContext, 'Post body')
        await funcTestHelper.subscribeToAsync(marsContext, lunaContext)
        await funcTestHelper.createCommentAsync(zeusContext, post.id, 'body')
        await funcTestHelper.goPrivate(lunaContext)
      })

      it('should be visible to already subscribed users', (done) => {
        request
          .get(`${app.context.config.host}/v1/users/${marsContext.username}/subscriptions`)
          .query({ authToken: marsContext.authToken })
          .end((err, res) => {
            res.body.should.not.be.empty
            res.body.should.have.property('subscriptions')
            res.body.subscriptions.length.should.eql(3)
            done()
          })
      })

      it('should be visible to mutual friends', (done) => {
        request
          .post(`${app.context.config.host}/v1/users/${lunaContext.user.username}/sendRequest`)
          .send({
            authToken: marsContext.authToken,
            '_method': 'post'
          })
          .end(() => {
            request
              .post(`${app.context.config.host}/v1/users/acceptRequest/${marsContext.user.username}`)
              .send({
                authToken: lunaContext.authToken,
                '_method': 'post'
              })
              .end(() => {
                request
                  .get(`${app.context.config.host}/v1/users/${marsContext.username}/subscriptions`)
                  .query({ authToken: marsContext.authToken })
                  .end((err, res) => {
                    res.body.should.not.be.empty
                    res.body.should.have.property('subscriptions')
                    res.body.subscriptions.should.not.be.empty
                    res.body.subscriptions.length.should.eql(3)
                    done()
                  })
              })
          })
      })

      it('should be visible to subscribers', (done) => {
        request
          .get(`${app.context.config.host}/v1/users/${marsContext.username}/subscriptions`)
          .query({ authToken: marsContext.authToken })
          .end((err, res) => {
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
    const lunaContext = {}
    const marsContext = {}
    const zeusContext = {}

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

        const marsRiver = await funcTestHelper.getRiverOfNews(marsContext);
        marsRiver.timelines.posts[0].should.equal(post1.id, 'order of posts in incorrect')
        marsRiver.timelines.posts[1].should.equal(post2.id, 'order of posts in incorrect')

        const zeusRiver = await funcTestHelper.getRiverOfNews(zeusContext);
        zeusRiver.timelines.posts[0].should.equal(post1.id, 'order of posts in incorrect')
      })

      it('should add post to "my discussions" after comment', async () => {
        await funcTestHelper.createCommentAsync(marsContext, post1.id, 'comment1')

        const marsDiscussions = await funcTestHelper.getMyDiscussions(marsContext);
        marsDiscussions.timelines.should.have.property('posts')
        marsDiscussions.timelines.posts.should.include(post1.id, 'commented post is not in "my discussions"')
        marsDiscussions.timelines.posts[0].should.equal(post1.id, 'order of posts in incorrect')
      })

      it('should add post to "my discussions" after like', async () => {
        await funcTestHelper.like(post1.id, marsContext.authToken)

        const marsDiscussions = await funcTestHelper.getMyDiscussions(marsContext);
        marsDiscussions.timelines.should.have.property('posts')
        marsDiscussions.timelines.posts.should.include(post1.id, 'liked post is not in "my discussions"')
        marsDiscussions.timelines.posts[0].should.equal(post1.id, 'order of posts in incorrect')
      })
    })
  })
})
