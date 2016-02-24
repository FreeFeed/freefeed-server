/*eslint-env node, mocha */
/*global $database */
import request from 'superagent'
import _ from 'lodash'
import fetch from 'node-fetch'

import { getSingleton } from '../../app/app'
import * as funcTestHelper from './functional_test_helper'


describe("PostsController", function() {
  let app

  beforeEach(async () => {
    app = await getSingleton()
    await $database.flushdbAsync()
  })

  describe('#create()', function() {
    var ctx = {}

    beforeEach(funcTestHelper.createUserCtx(ctx, 'Luna', 'password'))

    it('should create a post with a valid user', function(done) {
      var body = 'Post body'

      funcTestHelper.createPost(ctx, body)(function(req, res) {
        res.body.should.not.be.empty
        res.body.should.have.property('posts')
        res.body.posts.should.have.property('body')
        res.body.posts.body.should.eql(body)
        res.body.posts.commentsDisabled.should.eql('0')

        done()
      })
    })

    it('should not create a post with an invalid user', function(done) {
      var body = 'Post body'

      ctx.authToken = 'token'
      funcTestHelper.createPost(ctx, body)(function(err, res) {
        err.should.not.be.empty
        err.status.should.eql(401)

        done()
      })
    })

    it('should create a post with comments disabled', async () => {
      let body = 'Post body'
      let commentsDisabled = true

      let response = await funcTestHelper.createPostWithCommentsDisabled(ctx, body, commentsDisabled)
      response.status.should.eql(200)

      let data = await response.json()
      data.should.not.be.empty
      data.should.have.property('posts')
      data.posts.should.have.property('body')
      data.posts.body.should.eql(body)
      data.posts.commentsDisabled.should.eql('1')
    })

    it('should create a post with comments enabled', async () => {
      let body = 'Post body'
      let commentsDisabled = false

      let response = await funcTestHelper.createPostWithCommentsDisabled(ctx, body, commentsDisabled)
      response.status.should.eql(200)

      let data = await response.json()
      data.should.not.be.empty
      data.should.have.property('posts')
      data.posts.should.have.property('body')
      data.posts.body.should.eql(body)
      data.posts.commentsDisabled.should.eql('0')
    })

    describe('private messages', function() {
      var authTokenB
        , usernameB

      beforeEach(funcTestHelper.createUser('mars', 'password', function(token, user) {
        authTokenB = token
        usernameB = user.username
      }))

      it('should create public post that is visible to another user', function(done) {
        var body = 'body'

        funcTestHelper.createPost(ctx, body)(function(err, res) {
          res.body.should.not.be.empty
          res.body.should.have.property('posts')
          res.body.posts.should.have.property('body')
          res.body.posts.body.should.eql(body)
          var post = res.body.posts
          request
            .get(app.config.host + '/v1/posts/' + post.id)
            .query({ authToken: authTokenB })
            .end(function(err, res) {
              res.body.should.not.be.empty
              res.body.should.have.property('posts')
              res.body.posts.should.have.property('body')
              res.body.posts.body.should.eql(body)
              done()
            })
        })
      })

      it('should not be able to send private message if friends are not mutual', function(done) {
        var body = 'body'

        request
          .post(app.config.host + '/v1/posts')
          .send({ post: { body: body }, meta: { feeds: [usernameB] }, authToken: ctx.authToken })
          .end(function(err, res) {
            err.should.not.be.empty
            err.status.should.eql(403)
            err.response.error.should.have.property('text')
            JSON.parse(err.response.error.text).err.should.eql("You can't send private messages to friends that are not mutual")
            done()
          })
      })

      describe('for mutual friends', function() {
        beforeEach(function(done) {
          request
            .post(app.config.host + '/v1/users/' + ctx.username + '/subscribe')
            .send({ authToken: authTokenB })
            .end(function(err, res) {
              request
                .post(app.config.host + '/v1/users/' + usernameB + '/subscribe')
                .send({ authToken: ctx.authToken })
                .end(function(err, res) {
                  done()
                })
            })
        })

        describe('are protected', function() {
          var authTokenC
            , usernameC
            , post

          beforeEach(funcTestHelper.createUser('zeus', 'password', function(token, user) {
            authTokenC = token
            usernameC = user.username
          }))

          beforeEach(function(done) {
            var body = 'body'

            request
              .post(app.config.host + '/v1/posts')
              .send({ post: { body: body }, meta: { feeds: [usernameB] }, authToken: ctx.authToken })
              .end(function(err, res) {
                res.body.should.not.be.empty
                res.body.should.have.property('posts')
                post = res.body.posts
                post.should.have.property('body')
                post.body.should.eql(body)
                done()
              })
          })

          it('should not be liked by person that is not in recipients', function(done) {
            request
              .post(app.config.host + '/v1/posts/' + post.id + '/like')
              .send({ authToken: authTokenC })
              .end(function(err, res) {
                err.should.not.be.empty
                err.status.should.eql(422)
                var error = JSON.parse(err.response.error.text)
                error.err.should.eql('Not found')

                funcTestHelper.getTimeline('/v1/timelines/' + usernameC + '/likes', authTokenC, function(err, res) {
                  res.body.should.not.have.property('posts')
                  done()
                })
              })
          })

          it('should not be commented by person that is not in recipients', function(done) {
            var body = 'comment'
            funcTestHelper.createComment(body, post.id, authTokenC, function(err, res) {
              err.should.not.be.empty
              err.status.should.eql(404)
              var error = JSON.parse(err.response.error.text)
              error.err.should.eql('Not found')

              funcTestHelper.getTimeline('/v1/timelines/' + usernameC + '/comments', authTokenC, function(err, res) {
                res.body.should.not.have.property('posts')
                done()
              })
            })
          })
        })

        it('should be able to send private message', function(done) {
          var body = 'body'

          request
            .post(app.config.host + '/v1/posts')
            .send({ post: { body: body }, meta: { feeds: [usernameB] }, authToken: ctx.authToken })
            .end(function(err, res) {
              res.body.should.not.be.empty
              res.body.should.have.property('posts')
              res.body.posts.should.have.property('body')
              res.body.posts.body.should.eql(body)
              done()
            })
        })

        it('should publish private message to home feed', function(done) {
          var body = 'body'

          request
            .post(app.config.host + '/v1/posts')
            .send({ post: { body: body }, meta: { feeds: [usernameB] }, authToken: ctx.authToken })
            .end(function(err, res) {
              res.body.should.not.be.empty
              res.body.should.have.property('posts')
              res.body.posts.should.have.property('body')
              res.body.posts.body.should.eql(body)

              funcTestHelper.getTimeline('/v1/timelines/home', authTokenB, function(err, res) {
                res.body.should.have.property('posts')
                res.body.posts.length.should.eql(1)
                res.body.posts[0].should.have.property('body')
                res.body.posts[0].body.should.eql(body)
                funcTestHelper.getTimeline('/v1/timelines/home', ctx.authToken, function(err, res) {
                  res.body.should.have.property('posts')
                  res.body.posts.length.should.eql(1)
                  res.body.posts[0].should.have.property('body')
                  res.body.posts[0].body.should.eql(body)
                  done()
                })
              })
            })
        })

        it('should send private message that cannot be read by anyone else', function(done) {
          var body = 'body'
            , post

          request
            .post(app.config.host + '/v1/posts')
            .send({ post: { body: body }, meta: { feeds: [usernameB] }, authToken: ctx.authToken })
            .end(function(err, res) {
              post = res.body.posts

              var authTokenC
                , usernameC

              request
                .post(app.config.host + '/v1/users')
                .send({
                  username: 'zeus',
                  password: 'password'
                })
                .end(function(err, res) {
                  authTokenC = res.body.users.token
                  usernameC = res.body.users.username

                  request
                    .get(app.config.host + '/v1/posts/' + post.id)
                    .query({ authToken: authTokenC })
                    .end(function(err, res) {
                      err.should.not.be.empty
                      err.status.should.eql(403)
                      var error = JSON.parse(err.response.error.text)
                      error.err.should.eql('Not found')
                      done()
                    })
                })
            })
        })

        it('should send private message that can be read by recipients', function(done) {
          var body = 'body'
            , post

          request
            .post(app.config.host + '/v1/posts')
            .send({ post: { body: body }, meta: { feeds: [usernameB] }, authToken: ctx.authToken })
            .end(function(err, res) {
              post = res.body.posts

              request
                .get(app.config.host + '/v1/posts/' + post.id)
                .query({ authToken: authTokenB })
                .end(function(err, res) {
                  res.body.should.not.be.empty
                  res.body.posts.body.should.eql(post.body)
                  done()
                })
            })
        })

        it('should send private message to private feed for both users', function(done) {
          var body = 'body'

          request
            .post(app.config.host + '/v1/posts')
            .send({ post: { body: body }, meta: { feeds: [usernameB] }, authToken: ctx.authToken })
            .end(function(err, res) {
              funcTestHelper.getTimeline('/v1/timelines/filter/directs', ctx.authToken, function(err, res) {
                res.body.should.have.property('posts')
                res.body.posts.length.should.eql(1)
                res.body.posts[0].should.have.property('body')
                res.body.posts[0].body.should.eql(body)
                funcTestHelper.getTimeline('/v1/timelines/filter/directs', authTokenB, function(err, res) {
                  res.body.should.have.property('posts')
                  res.body.posts.length.should.eql(1)
                  res.body.posts[0].should.have.property('body')
                  res.body.posts[0].body.should.eql(body)
                  done()
                })
              })
            })
        })
      })
    })

    describe('in a group', function() {
      var groupName = 'pepyatka-dev'
      var otherUserName = 'yole'
      var otherUserAuthToken

      beforeEach(function(done) {
        var screenName = 'Pepyatka Developers';
        request
          .post(app.config.host + '/v1/groups')
          .send({ group: { username: groupName, screenName: screenName },
                  authToken: ctx.authToken })
          .end(function(err, res) {
            done()
          })
      })

      beforeEach(funcTestHelper.createUser(otherUserName, 'pw', function(token) {
        otherUserAuthToken = token
      }))

      it('should allow subscribed user to post to group', function(done) {
        var body = 'Post body'

        request
          .post(app.config.host + '/v1/posts')
          .send({ post: { body: body }, meta: { feeds: [groupName] }, authToken: ctx.authToken })
          .end(function(err, res) {
            res.body.should.not.be.empty
            res.body.should.have.property('posts')
            res.body.posts.should.have.property('body')
            res.body.posts.body.should.eql(body)

            request
              .get(app.config.host + '/v1/timelines/' + groupName)
              .query({authToken: ctx.authToken})
              .end(function (err, res) {
                res.body.posts.length.should.eql(1)
                res.body.posts[0].body.should.eql(body)

                // Verify that the post didn't appear in the user's own timeline
                request
                  .get(app.config.host + '/v1/timelines/' + ctx.username)
                  .query({ authToken: context.authToken })
                  .end(function(err, res) {
                    res.should.not.be.empty
                    res.body.should.not.be.empty
                    res.body.should.have.property('timelines')
                    res.body.timelines.should.have.property('name')
                    res.body.timelines.name.should.eql('Posts')
                    res.body.timelines.should.not.have.property('posts')
                    res.body.should.not.have.property('posts')

                    done()
                  })
              })
          })
      })

      it("should cross-post between a group and a user's feed", function(done) {
        var body = 'Post body'

        request
          .post(app.config.host + '/v1/posts')
          .send({ post: { body: body }, meta: { feeds: [groupName, ctx.username] }, authToken: ctx.authToken })
          .end(function(err, res) {
            _.isUndefined(res).should.be.false
            res.body.should.not.be.empty
            res.body.should.have.property('posts')
            res.body.posts.should.have.property('body')
            res.body.posts.body.should.eql(body)

            request
              .get(app.config.host + '/v1/timelines/' + groupName)
              .query({authToken: ctx.authToken})
              .end(function (err, res) {
                res.body.posts.length.should.eql(1)
                res.body.posts[0].body.should.eql(body)

                // Verify that the post didn't appear in the user's own timeline
                request
                  .get(app.config.host + '/v1/timelines/' + ctx.username)
                  .query({ authToken: context.authToken })
                  .end(function(err, res) {
                    res.body.posts.length.should.eql(1)
                    res.body.posts[0].body.should.eql(body)

                    done()
                  })
              })
          })
      })

      it("should update group's last activity", function(done) {
        var body = 'Post body'

        funcTestHelper.getTimeline('/v1/users/' + groupName, ctx.authToken, function(err, res) {
          var oldGroupTimestamp = res.body.users.updatedAt;

          request
            .post(app.config.host + '/v1/posts')
            .send({post: {body: body}, meta: {feeds: [groupName]}, authToken: ctx.authToken})
            .end(function (err, res) {
              var postTimestamp = res.body.posts.createdAt
              res.status.should.eql(200)

              funcTestHelper.getTimeline('/v1/users/' + groupName, ctx.authToken, function (err, res) {
                var groupTimestamp = res.body.users.updatedAt;

                groupTimestamp.should.be.gt(oldGroupTimestamp)
                groupTimestamp.should.be.gte(postTimestamp)

                done()
              })
            })
        })
      })

      it("should show post to group in the timeline of the subscribing user", function(done) {
        request
          .post(app.config.host + '/v1/users/' + groupName + '/subscribe')
          .send({ authToken: otherUserAuthToken })
          .end(function(err, res) {
            res.status.should.eql(200)
            var body = 'Post body'

            request
              .post(app.config.host + '/v1/posts')
              .send({ post: { body: body }, meta: { feeds: [groupName] }, authToken: ctx.authToken })
              .end(function(err, res) {
                res.status.should.eql(200)
                funcTestHelper.getTimeline('/v1/timelines/home', otherUserAuthToken, function(err, res) {
                  res.body.should.have.property('posts')
                  res.body.posts.length.should.eql(1)
                  res.body.posts[0].body.should.eql(body)
                  done()
                })
              })
          })
      })

      it("should not show post to group in the timeline of another user", function(done) {
        request
          .post(app.config.host + '/v1/users/' + ctx.username + '/subscribe')
          .send({ authToken: otherUserAuthToken })
          .end(function(err, res) {
            res.status.should.eql(200)
            var body = 'Post body'

            request
              .post(app.config.host + '/v1/posts')
              .send({ post: { body: body }, meta: { feeds: [groupName] }, authToken: ctx.authToken })
              .end(function(err, res) {
                res.status.should.eql(200)
                funcTestHelper.getTimeline('/v1/timelines/home', otherUserAuthToken, function(err, res) {
                  res.body.should.not.have.property('posts')
                  done()
                })
              })
          })
      })

      it("should not show liked post to group in the timeline of another user", function(done) {
        request
          .post(app.config.host + '/v1/users/' + ctx.username + '/subscribe')
          .send({ authToken: otherUserAuthToken })
          .end(function(err, res) {
            res.status.should.eql(200)
            var body = 'Post body'

            request
              .post(app.config.host + '/v1/posts')
              .send({ post: { body: body }, meta: { feeds: [groupName] }, authToken: ctx.authToken })
              .end(function(err, res) {
                res.status.should.eql(200)
                var post = res.body.posts
                request
                  .post(app.config.host + '/v1/posts/' + post.id + '/like')
                  .send({ authToken: ctx.authToken })
                  .end(function(err, res) {
                    funcTestHelper.getTimeline('/v1/timelines/home', otherUserAuthToken, function(err, res) {
                      res.body.should.not.have.property('posts')
                      done()
                    })
                  })
              })
          })
      })

      it("should not show liked post to group in the user posts", function(done) {
        var body = 'Post body'

        request
          .post(app.config.host + '/v1/posts')
          .send({ post: { body: body }, meta: { feeds: [groupName] }, authToken: ctx.authToken })
          .end(function(err, res) {
            res.status.should.eql(200)
            var post = res.body.posts
            request
              .post(app.config.host + '/v1/posts/' + post.id + '/like')
              .send({ authToken: ctx.authToken })
              .end(function(err, res) {
                funcTestHelper.getTimeline('/v1/timelines/' + ctx.username, ctx.authToken, function(err, res) {
                  res.body.should.not.have.property('posts')
                  done()
                })
              })
          })
      })

      it("should not allow a user to post to another user's feed", function(done) {
        request
          .post(app.config.host + '/v1/posts')
          .send({ post: { body: 'Post body' }, meta: { feeds: [otherUserName] }, authToken: ctx.authToken })
          .end(function(err, res) {
            err.status.should.eql(403)
            res.body.err.should.eql("You can't send private messages to friends that are not mutual")

            done()
          })
      })

      it('should not allow a user to post to a group to which they are not subscribed', function(done) {
        request
          .post(app.config.host + '/v1/posts')
          .send({
            post: { body: 'Post body' },
            meta: { feeds: [groupName] },
            authToken: otherUserAuthToken
          })
          .end(function (err, res) {
            err.should.not.be.empty
            err.status.should.eql(403)
            res.body.err.should.eql("You can't post to a group to which you aren't subscribed")

            done()
          })
      })
    })
  })

  describe('#like()', function() {
    var context = {}
    var otherUserAuthToken

    beforeEach(funcTestHelper.createUserCtx(context, 'Luna', 'password'))
    beforeEach(function(done) { funcTestHelper.createPost(context, 'Post body')(done) })

    beforeEach(funcTestHelper.createUser('mars', 'password2', function(token) {
      otherUserAuthToken = token
    }))

    describe('in a group', function() {
      var groupName = 'pepyatka-dev'

      beforeEach(function(done) {
        var screenName = 'Pepyatka Developers';
        request
            .post(app.config.host + '/v1/groups')
            .send({ group: {username: groupName, screenName: screenName},
              authToken: context.authToken })
            .end(function(err, res) {
              done()
            })
      })

      it("should not update group's last activity", function(done) {
        var body = 'Post body'

        request
          .post(app.config.host + '/v1/posts')
          .send({ post: { body: body }, meta: { feeds: [groupName] }, authToken: context.authToken })
          .end(function(err, res) {
            res.status.should.eql(200)
            funcTestHelper.getTimeline('/v1/users/' + groupName, context.authToken, function(err, res) {
              res.status.should.eql(200)
              var lastUpdatedAt = res.body.users.updatedAt

              request
                .post(app.config.host + '/v1/posts/' + context.post.id + '/like')
                .send({ authToken: otherUserAuthToken })
                .end(function(err, res) {
                  res.status.should.eql(200)
                  funcTestHelper.getTimeline('/v1/users/' + groupName, context.authToken, function(err, res) {
                    res.status.should.eql(200)
                    res.body.should.have.property('users')
                    res.body.users.should.have.property('updatedAt')
                    lastUpdatedAt.should.be.eql(res.body.users.updatedAt)

                    done()
                  })
                })
            })
          })
      })
    })

    it('should like post with a valid user not more than 1 time', async () => {
      {
        let response = await funcTestHelper.like(context.post.id, otherUserAuthToken)
        response.status.should.eql(200)
      }

      {
        let response = await funcTestHelper.like(context.post.id, otherUserAuthToken)
        response.status.should.eql(403)

        let data = await response.json()
        data.should.have.property('err')
        data.err.should.eql("You can't like post that you have already liked")
      }
    })

    it('should not like post with an invalid user', function(done) {
      request
        .post(app.config.host + '/v1/posts/' + context.post.id + '/like')
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })

    it('should not like invalid post', function(done) {
      request
        .post(app.config.host + '/v1/posts/:id/like')
        .send({ authToken: context.authToken })
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(404)
          done()
        })
    })

    it("should not like user's own post", async () => {
      let response = await funcTestHelper.like(context.post.id, context.authToken)
      response.status.should.eql(403)

      let data = await response.json()
      data.should.have.property('err')
      data.err.should.eql("You can't like your own post")
    })
  })

  describe('#unlike()', function() {
    var context = {}
    var otherUserAuthToken

    beforeEach(funcTestHelper.createUserCtx(context, 'Luna', 'password'))
    beforeEach(function(done) { funcTestHelper.createPost(context, 'Post body')(done) })

    beforeEach(funcTestHelper.createUser('mars', 'password2', function(token) {
      otherUserAuthToken = token
    }))

    it('unlike should fail if post was not yet liked and succeed after it was liked with a valid user', function(done) {
      request
        .post(app.config.host + '/v1/posts/' + context.post.id + '/unlike')
        .send({ authToken: otherUserAuthToken })
        .end(function(err, res) {

          err.should.not.be.empty
          err.status.should.eql(403)
          err.response.error.should.have.property('text')
          JSON.parse(err.response.error.text).err.should.eql("You can't un-like post that you haven't yet liked")

          request
            .post(app.config.host + '/v1/posts/' + context.post.id + '/like')
            .send({ authToken: otherUserAuthToken })
            .end(function(err, res) {
              res.body.should.be.empty
              $should.not.exist(err)

              request
                .post(app.config.host + '/v1/posts/' + context.post.id + '/unlike')
                .send({ authToken: otherUserAuthToken })
                .end(function(err, res) {
                  res.body.should.be.empty
                  $should.not.exist(err)

                  done()
                })
            })
        })
    })

    it('should not unlike post with an invalid user', function(done) {
      request
        .post(app.config.host + '/v1/posts/' + context.post.id + '/unlike')
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })

    it('should not unlike invalid post', function(done) {
      request
        .post(app.config.host + '/v1/posts/:id/unlike')
        .send({ authToken: context.authToken })
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(404)
          done()
        })
    })

    it("should not un-like user's own post", async () => {
      let response = await funcTestHelper.unlike(context.post.id, context.authToken)
      response.status.should.eql(403)

      let data = await response.json()
      data.should.have.property('err')
      data.err.should.eql("You can't un-like your own post")
    })
  })

  describe('#disableComments()', function() {
    var context = {}
    var otherUserAuthToken

    beforeEach(funcTestHelper.createUserCtx(context, 'luna', 'password'))
    beforeEach(async () => {
      let response = await funcTestHelper.createPostWithCommentsDisabled(context, 'Post body', false)
      let data = await response.json()
      context.post = data.posts
    })
    beforeEach(funcTestHelper.createUser('mars', 'password2', function(token) {
      otherUserAuthToken = token
    }))

    it("should disable comments for own post", async () => {
      {
        let response = await funcTestHelper.disableComments(context.post.id, context.authToken)
        response.status.should.eql(200)
      }

      {
        let response = await funcTestHelper.readPostAsync(context.post.id, context)
        response.status.should.eql(200)

        let data = await response.json()
        data.posts.commentsDisabled.should.eql('1')
      }
    })

    it("should not disable comments for another user's post", async () => {
      {
        let response = await funcTestHelper.disableComments(context.post.id, otherUserAuthToken)
        response.status.should.eql(403)

        let data = await response.json()
        data.should.have.property('err')
        data.err.should.eql("You can't disable comments for another user's post")
      }

      {
        let response = await funcTestHelper.readPostAsync(context.post.id, context)
        response.status.should.eql(200)

        let data = await response.json()
        data.posts.commentsDisabled.should.eql('0')
      }
    })
  })

  describe('#enableComments()', function() {
    var context = {}
    var otherUserAuthToken

    beforeEach(funcTestHelper.createUserCtx(context, 'luna', 'password'))
    beforeEach(async () => {
      let response = await funcTestHelper.createPostWithCommentsDisabled(context, 'Post body', true)
      let data = await response.json()
      context.post = data.posts
    })
    beforeEach(funcTestHelper.createUser('mars', 'password2', function(token) {
      otherUserAuthToken = token
    }))

    it("should enable comments for own post", async () => {
      {
        let response = await funcTestHelper.enableComments(context.post.id, context.authToken)
        response.status.should.eql(200)
      }

      {
        let response = await funcTestHelper.readPostAsync(context.post.id, context)
        response.status.should.eql(200)

        let data = await response.json()
        data.posts.commentsDisabled.should.eql('0')
      }
    })

    it("should not enable comments for another user's post", async () => {
      {
        let response = await funcTestHelper.enableComments(context.post.id, otherUserAuthToken)
        response.status.should.eql(403)

        let data = await response.json()
        data.should.have.property('err')
        data.err.should.eql("You can't enable comments for another user's post")
      }

      {
        let response = await funcTestHelper.readPostAsync(context.post.id, context)
        response.status.should.eql(200)

        let data = await response.json()
        data.posts.commentsDisabled.should.eql('1')
      }
    })
  })

  describe('#update()', function() {
    var context = {}
    var otherUserAuthToken

    beforeEach(funcTestHelper.createUserCtx(context, 'Luna', 'password'))
    beforeEach(funcTestHelper.createPost(context, 'Post body'))
    beforeEach(funcTestHelper.createUser('yole', 'pw', function(token) {
      otherUserAuthToken = token
    }))

    it('should update post with a valid user', function(done) {
      var newBody = "New body"
      request
        .post(app.config.host + '/v1/posts/' + context.post.id)
        .send({ post: { body: newBody },
                authToken: context.authToken,
                '_method': 'put'
              })
        .end(function(err, res) {
          res.body.should.not.be.empty
          res.body.should.have.property('posts')
          res.body.posts.should.have.property('body')
          res.body.posts.body.should.eql(newBody)

          done()
        })
    })

    it('should not update post with a invalid user', function(done) {
      var newBody = "New body"
      request
        .post(app.config.host + '/v1/posts/' + context.post.id)
        .send({ post: { body: newBody },
                '_method': 'put'
              })
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(401)

          done()
        })
    })

    it("should not update another user's post", function(done) {
      var newBody = "New body"
      request
          .post(app.config.host + '/v1/posts/' + context.post.id)
          .send({ post: { body: newBody },
            authToken: otherUserAuthToken,
            '_method': 'put'
          })
          .end(function(err, res) {
            err.status.should.eql(403)
            res.body.err.should.eql("You can't update another user's post")

            done()
          })
    })

    it("should update post with adding/removing attachments", async () => {
      const newPost = {
        body: 'New body',
        attachments: []
      }

      // Create attachments
      {
        const attachmentResponse = await funcTestHelper.createMockAttachmentAsync(context)
        newPost.attachments.push(attachmentResponse.id)
      }
      {
        const attachmentResponse = await funcTestHelper.createMockAttachmentAsync(context)
        newPost.attachments.push(attachmentResponse.id)
      }

      // Add attachments to the post
      {
        const response = await funcTestHelper.updatePostAsync(context, newPost)
        response.status.should.eql(200)

        const data = await response.json()
        data.should.not.be.empty
        data.should.have.property('posts')
        data.posts.body.should.eql(newPost.body)
        data.should.have.property('attachments')
        data.posts.attachments.should.eql(newPost.attachments)
      }

      // Remove attachments from the post
      {
        const anotherPost = {
          body: 'Another body',
          attachments: [ newPost.attachments[0] ] // leave the first attachment only
        }

        const response = await funcTestHelper.updatePostAsync(context, anotherPost)
        response.status.should.eql(200)

        const data = await response.json()
        data.should.not.be.empty
        data.should.have.property('posts')
        data.posts.body.should.eql(anotherPost.body)
        data.should.have.property('attachments')
        data.posts.attachments.should.eql(anotherPost.attachments)
      }
   })
  })

  describe('#show()', function() {
    var context = {}

    beforeEach(funcTestHelper.createUserCtx(context, 'Luna', 'password'))
    beforeEach(funcTestHelper.createPost(context, 'Post body'))

    it('should show a post', function(done) {
      request
        .get(app.config.host + '/v1/posts/' + context.post.id)
        .query({ authToken: context.authToken })
        .end(function(err, res) {
          res.body.should.not.be.empty
          res.body.should.have.property('posts')
          res.body.posts.should.have.property('body')
          res.body.posts.body.should.eql(context.post.body)

          done()
        })
    })

    it('should show a post to anonymous user', async () => {
      let response = await fetch(`${app.config.host}/v1/posts/${context.post.id}`)
      response.status.should.eql(200, `anonymous user couldn't read post`)

      let data = await response.json()
      data.posts.body.should.eql(context.post.body)
    })

    it('should return 404 given an invalid post ID', function(done) {
      request
          .get(app.config.host + '/v1/posts/123_no_such_id')
          .query({ authToken: context.authToken })
          .end(function(err, res) {
            err.status.should.eql(404)
            res.body.err.should.eql("Can't find post")

            done()
          })
    })

    describe('with likes', async () => {
      let users

      beforeEach(async () => {
        let promises = [];
        for (let i=0; i<10; i++) {
          promises.push(funcTestHelper.createUserAsync(`lunokhod${i}`, 'password'))
        }
        users = await Promise.all(promises)

        for (let u of users) {
          await funcTestHelper.subscribeToAsync(u, context)
          await funcTestHelper.subscribeToAsync(context, u)
        }

        await funcTestHelper.goPrivate(context)

        for (let u of users) {
          await funcTestHelper.like(context.post.id, u.authToken)
        }
      })

      it('should show all likes', async () => {
        let response = await funcTestHelper.readPostAsync(context.post.id, users[5])
        response.status.should.eql(200, `user couldn't read post`)

        let data = await response.json()
        data.posts.likes.length.should.eql(3)
        data.posts.omittedLikes.should.eql(7)
      })
    })
  })

  describe('#hide()', function() {
    var username = 'Luna'
    var context = {}

    beforeEach(funcTestHelper.createUserCtx(context, username, 'password'))
    beforeEach(funcTestHelper.createPost(context, 'Post body'))

    it("should hide and unhide post", function(done) {
      request
        .post(app.config.host + '/v1/posts/' + context.post.id + '/hide')
        .send({
          authToken: context.authToken,
        })
        .end(function(err, res) {
          funcTestHelper.getTimeline('/v1/timelines/home', context.authToken, function(err, res) {
            res.should.not.be.empty
            res.body.should.not.be.empty
            res.body.should.have.property('timelines')
            res.body.timelines.should.have.property('name')
            res.body.timelines.name.should.eql('RiverOfNews')
            res.body.timelines.should.have.property('posts')
            res.body.should.have.property('posts')
            res.body.posts.length.should.eql(1)
            var post = res.body.posts[0]
            post.should.have.property('isHidden')
            post.isHidden.should.eql(true)

            request
              .post(app.config.host + '/v1/posts/' + context.post.id + '/unhide')
              .send({
                authToken: context.authToken,
              })
              .end(function(err, res) {
                funcTestHelper.getTimeline('/v1/timelines/home', context.authToken, function(err, res) {
                  res.should.not.be.empty
                  res.body.should.not.be.empty
                  res.body.should.have.property('timelines')
                  res.body.timelines.should.have.property('name')
                  res.body.timelines.name.should.eql('RiverOfNews')
                  res.body.timelines.should.have.property('posts')
                  res.body.should.have.property('posts')
                  res.body.posts.length.should.eql(1)
                  var post = res.body.posts[0]
                  post.should.not.have.property('isHidden')
                  done()
                })
              })
          })
        })
    })
  })

  describe('#destroy()', function() {
    var username = 'Luna'
    var context = {}
    var otherUserAuthToken

    beforeEach(funcTestHelper.createUserCtx(context, username, 'password'))
    beforeEach(funcTestHelper.createPost(context, 'Post body'))
    beforeEach(funcTestHelper.createUser('yole', 'pw', function(token) {
      otherUserAuthToken = token
    }))

    it('should destroy valid post', function(done) {
      request
        .post(app.config.host + '/v1/posts/' + context.post.id)
        .send({
          authToken: context.authToken,
          '_method': 'delete'
        })
        .end(function(err, res) {
          res.body.should.be.empty
          res.status.should.eql(200)

          request
            .get(app.config.host + '/v1/timelines/' + username)
            .query({ authToken: context.authToken })
            .end(function(err, res) {
              res.should.not.be.empty
              res.body.should.not.be.empty
              res.body.should.have.property('timelines')
              res.body.timelines.should.have.property('name')
              res.body.timelines.name.should.eql('Posts')
              res.body.timelines.should.not.have.property('posts')
              res.body.should.not.have.property('posts')
              done()
            })
        })
    })

    it('should not destroy valid post without user', function(done) {
      request
        .post(app.config.host + '/v1/posts/' + context.post.id)
        .send({
          '_method': 'delete'
        })
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })

    it("should not destroy another user's post", function(done) {
      request
          .post(app.config.host + '/v1/posts/' + context.post.id)
          .send({
            authToken: otherUserAuthToken,
            '_method': 'delete'
          })
          .end(function(err, res) {
            err.status.should.eql(403)
            res.body.err.should.eql("You can't delete another user's post")

            done()
          })
    })
  })
})
