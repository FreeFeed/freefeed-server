/*eslint-env node, mocha */
/*global $database */
import request from 'superagent'

import { getSingleton } from '../../app/app'
import * as funcTestHelper from './functional_test_helper'


describe("CommentsController", function() {
  let app

  beforeEach(async () => {
    app = await getSingleton()
    await $database.flushdbAsync()
  })

  describe('#create()', function() {
    var post
      , context = {}

    beforeEach(funcTestHelper.createUserCtx(context, 'Luna', 'password'))
    beforeEach(funcTestHelper.createPost(context, 'Post body'))

    describe('in a group', function() {
      var groupName = 'pepyatka-dev'

      beforeEach(function(done) {
        var screenName = 'Pepyatka Developers';
        request
          .post(app.config.host + '/v1/groups')
          .send({ group: { username: groupName, screenName: screenName },
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
            var postB = res.body.posts
            funcTestHelper.getTimeline('/v1/users/' + groupName, context.authToken, function(err, res) {
              res.status.should.eql(200)
              var lastUpdatedAt = res.body.users.updatedAt

              funcTestHelper.createComment(body, postB.id, context.authToken, function(err, res) {
                res.status.should.eql(200)
                funcTestHelper.getTimeline('/v1/users/' + groupName, context.authToken, function(err, res) {
                  res.status.should.eql(200)
                  res.body.should.have.property('users')
                  res.body.users.should.have.property('updatedAt')
                  lastUpdatedAt.should.be.lt(res.body.users.updatedAt)

                  done()
                })
              })
            })
          })
      })
    })

    it('should create a comment with a valid user', function(done) {
      var body = 'Comment'

      funcTestHelper.createCommentCtx(context, body)(function(err, res) {
        res.body.should.not.be.empty
        res.body.should.have.property('comments')
        res.body.comments.should.have.property('body')
        res.body.comments.body.should.eql(body)

        done()
      })
    })

    it('should not create a comment for an invalid user', function(done) {
      var body = "Comment"

      context.authToken = 'token'
      funcTestHelper.createCommentCtx(context, body)(function(err, res) {
        err.should.not.be.empty
        err.status.should.eql(401)

        done()
      })
    })

    it('should not create a comment for an invalid post', function(done) {
      var body = "Comment"

      context.post.id = 'id'
      funcTestHelper.createCommentCtx(context, body)(function(err, res) {
        err.should.not.be.empty
        err.status.should.eql(404)

        done()
      })
    })

    it('should create a comment to own post even when comments disabled', async () => {
      let postResponse = await funcTestHelper.createPostWithCommentsDisabled(context, 'Post body', true)
      let data = await postResponse.json()
      let post = data.posts

      let response = await funcTestHelper.createCommentAsync(context, post.id, 'Comment')
      response.status.should.eql(200)
    })

    it("should not create a comment to another user's post when comments disabled", async () => {
      let postResponse = await funcTestHelper.createPostWithCommentsDisabled(context, 'Post body', true)
      let postData = await postResponse.json()
      let post = postData.posts

      let marsContext = await funcTestHelper.createUserAsync('mars', 'password2')

      let response = await funcTestHelper.createCommentAsync(marsContext, post.id, 'Comment')
      response.status.should.eql(403)

      let data = await response.json()
      data.should.have.property('err')
      data.err.should.eql('Comments disabled')
    })
  })

  describe('#update()', function() {
    var lunaContext = {}
      , yoleContext = {}

    beforeEach(funcTestHelper.createUserCtx(lunaContext, 'Luna', 'password'))
    beforeEach(funcTestHelper.createUserCtx(yoleContext, 'yole', 'pw'))

    beforeEach(function(done) { funcTestHelper.createPost(lunaContext, 'post body')(done) })
    beforeEach(function(done) { funcTestHelper.createCommentCtx(lunaContext, 'comment')(done) })

    it('should update a comment with a valid user', function(done) {
      var newBody = "New body"
      request
        .post(app.config.host + '/v1/comments/' + lunaContext.comment.id)
        .send({ comment: { body: newBody },
                authToken: lunaContext.authToken,
                '_method': 'put'
              })
        .end(function(err, res) {
          res.body.should.not.be.empty
          res.body.should.have.property('comments')
          res.body.comments.should.have.property('body')
          res.body.comments.body.should.eql(newBody)

          done()
        })
    })

    it('should not update a comment with a invalid user', function(done) {
      var newBody = "New body"
      request
        .post(app.config.host + '/v1/comments/' + lunaContext.comment.id)
        .send({ comment: { body: newBody },
                '_method': 'put'
              })
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(401)

          done()
        })
    })

    it("should not update another user's comment", function(done) {
      var newBody = "New body"
      request
          .post(app.config.host + '/v1/comments/' + lunaContext.comment.id)
          .send({ comment: { body: newBody },
            authToken: yoleContext.authToken,
            '_method': 'put'
          })
          .end(function(err, res) {
            err.status.should.eql(403)
            done()
          })
    })
  })

  describe('#destroy()', function() {
    var lunaContext = {}
      , yoleContext = {}

    beforeEach(funcTestHelper.createUserCtx(lunaContext, 'Luna', 'password'))
    beforeEach(funcTestHelper.createUserCtx(yoleContext, 'yole', 'pw'))

    beforeEach(function(done) { funcTestHelper.createPost(lunaContext, 'Post body')(done) })
    beforeEach(function(done) { funcTestHelper.createCommentCtx(lunaContext, 'Comment')(done) })

    it('should destroy valid comment', function(done) {
      funcTestHelper.removeComment(lunaContext.comment.id, lunaContext.authToken, function(err, res) {
        res.body.should.be.empty
        res.status.should.eql(200)

        request
          .get(app.config.host + '/v1/posts/' + lunaContext.post.id)
          .query({ authToken: lunaContext.authToken })
          .end(function(err, res) {
            res.should.not.be.empty
            res.body.should.not.be.empty
            res.body.should.have.property('posts')
            res.body.posts.should.not.have.property('comments')
            done()
          })
      })
    })

    it('should not destroy valid comment without user', function(done) {
      request
        .post(app.config.host + '/v1/comments/' + lunaContext.comment.id)
        .send({
          '_method': 'delete'
        })
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(401)
          done()
        })
    })

    it("should not destroy another user's comment", function(done) {
      request
        .post(app.config.host + '/v1/comments/' + lunaContext.comment.id)
        .query({ authToken: yoleContext.authToken })
        .send({
          '_method': 'delete'
        })
        .end(function(err, res) {
          err.should.not.be.empty
          err.status.should.eql(403)
          done()
        })
    })
  })
})
