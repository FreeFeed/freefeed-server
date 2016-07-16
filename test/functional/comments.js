/* eslint-env node, mocha */
/* global $pg_database */
import request from 'superagent'
import knexCleaner from 'knex-cleaner'

import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub } from '../../app/models'
import * as funcTestHelper from './functional_test_helper'


describe('CommentsController', function () {
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
    beforeEach(async() => {
      context = await funcTestHelper.createUserAsync('Luna', 'password')
      context.post = await funcTestHelper.createAndReturnPost(context, 'Post body')
    })

    describe('in a group', function () {
      var groupName = 'pepyatka-dev'

      beforeEach(function (done) {
        var screenName = 'Pepyatka Developers';
        request
          .post(app.config.host + '/v1/groups')
          .send({
            group: { username: groupName, screenName },
            authToken: context.authToken
          })
          .end(function () {
            done()
          })
      })

      it("should not update group's last activity", function (done) {
        var body = 'Post body'

        request
          .post(app.config.host + '/v1/posts')
          .send({ post: { body }, meta: { feeds: [groupName] }, authToken: context.authToken })
          .end(function (err, res) {
            res.status.should.eql(200)
            var postB = res.body.posts
            funcTestHelper.getTimeline('/v1/users/' + groupName, context.authToken, function (err, res) {
              res.status.should.eql(200)
              var lastUpdatedAt = res.body.users.updatedAt

              funcTestHelper.createComment(body, postB.id, context.authToken, function (err, res) {
                res.status.should.eql(200)
                funcTestHelper.getTimeline('/v1/users/' + groupName, context.authToken, function (err, res) {
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

    it('should create a comment with a valid user', function (done) {
      var body = 'Comment'

      funcTestHelper.createCommentCtx(context, body)(function (err, res) {
        res.body.should.not.be.empty
        res.body.should.have.property('comments')
        res.body.comments.should.have.property('body')
        res.body.comments.body.should.eql(body)

        done()
      })
    })

    it('should not create a comment for an invalid user', function (done) {
      var body = 'Comment'

      context.authToken = 'token'
      funcTestHelper.createCommentCtx(context, body)(function (err) {
        err.should.not.be.empty
        err.status.should.eql(401)

        done()
      })
    })

    it('should not create a comment for an invalid post', function (done) {
      var body = 'Comment'

      context.post.id = 'id'
      funcTestHelper.createCommentCtx(context, body)(function (err) {
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

  describe('#update()', function () {
    var lunaContext = {}
      , yoleContext = {}

    beforeEach(funcTestHelper.createUserCtx(lunaContext, 'Luna', 'password'))
    beforeEach(funcTestHelper.createUserCtx(yoleContext, 'yole', 'pw'))

    beforeEach(function (done) { funcTestHelper.createPost(lunaContext, 'post body')(done) })
    beforeEach(function (done) { funcTestHelper.createCommentCtx(lunaContext, 'comment')(done) })

    it('should update a comment with a valid user', function (done) {
      var newBody = 'New body'
      request
        .post(app.config.host + '/v1/comments/' + lunaContext.comment.id)
        .send({
          comment: { body: newBody },
          authToken: lunaContext.authToken,
          '_method': 'put'
        })
        .end(function (err, res) {
          res.body.should.not.be.empty
          res.body.should.have.property('comments')
          res.body.comments.should.have.property('body')
          res.body.comments.body.should.eql(newBody)

          done()
        })
    })

    it('should not update a comment with a invalid user', function (done) {
      var newBody = 'New body'
      request
        .post(app.config.host + '/v1/comments/' + lunaContext.comment.id)
        .send({
          comment: { body: newBody },
          '_method': 'put'
        })
        .end(function (err) {
          err.should.not.be.empty
          err.status.should.eql(401)

          done()
        })
    })

    it("should not update another user's comment", function (done) {
      var newBody = 'New body'
      request
          .post(app.config.host + '/v1/comments/' + lunaContext.comment.id)
          .send({
            comment: { body: newBody },
            authToken: yoleContext.authToken,
            '_method': 'put'
          })
          .end(function (err) {
            err.status.should.eql(403)
            done()
          })
    })
  })

  describe('#destroy()', function () {
    let lunaContext = {},
      marsContext = {},
      ceresContext = {},
      lunaPostLunaComment,
      lunaPostMarsComment,
      marsPostMarsComment,
      marsPostLunaComment,
      marsPostCeresComment

    beforeEach(funcTestHelper.createUserCtx(lunaContext, 'luna', 'password'))
    beforeEach(funcTestHelper.createUserCtx(marsContext, 'mars', 'password2'))
    beforeEach(funcTestHelper.createUserCtx(ceresContext, 'ceres', 'password3'))

    beforeEach(function (done) { funcTestHelper.createPost(lunaContext, 'Post body 1')(done) })
    beforeEach(function (done) { funcTestHelper.createPost(marsContext, 'Post body 2')(done) })

    beforeEach(async () => {
      let response = await funcTestHelper.createCommentAsync(lunaContext, lunaContext.post.id, 'Comment 1-1')
      let data = await response.json()
      lunaPostLunaComment = data.comments.id

      response = await funcTestHelper.createCommentAsync(marsContext, lunaContext.post.id, 'Comment 1-2')
      data = await response.json()
      lunaPostMarsComment = data.comments.id

      response = await funcTestHelper.createCommentAsync(marsContext, marsContext.post.id, 'Comment 2-1')
      data = await response.json()
      marsPostMarsComment = data.comments.id

      response = await funcTestHelper.createCommentAsync(lunaContext, marsContext.post.id, 'Comment 2-2')
      data = await response.json()
      marsPostLunaComment = data.comments.id

      response = await funcTestHelper.createCommentAsync(ceresContext, marsContext.post.id, 'Comment 2-3')
      data = await response.json()
      marsPostCeresComment = data.comments.id
    })

    it('should remove comment (your own comment in your own post)', async () => {
      let response = await funcTestHelper.removeCommentAsync(lunaContext, lunaPostLunaComment)
      response.status.should.eql(200)
    })

    it("should remove comment (other's comment in your own post)", async () => {
      let response = await funcTestHelper.removeCommentAsync(lunaContext, lunaPostMarsComment)
      response.status.should.eql(200)
    })

    it("should remove comment (your own comment in other's post)", async () => {
      let response = await funcTestHelper.removeCommentAsync(lunaContext, marsPostLunaComment)
      response.status.should.eql(200)
    })

    it("should not remove comment (other's comment in other's post)", async () => {
      let response = await funcTestHelper.removeCommentAsync(lunaContext, marsPostMarsComment)
      response.status.should.eql(403)

      let data = await response.json()
      data.should.have.property('err')
      data.err.should.eql("You don't have permission to delete this comment")
    })

    it("should not remove comment (other's comment in other's post, again)", async () => {
      let response = await funcTestHelper.removeCommentAsync(lunaContext, marsPostCeresComment)
      response.status.should.eql(403)

      let data = await response.json()
      data.should.have.property('err')
      data.err.should.eql("You don't have permission to delete this comment")
    })

    it('should not remove comment if anonymous', async () => {
      let response = await funcTestHelper.removeCommentAsync({}, lunaPostLunaComment)
      response.status.should.eql(401)
    })
  })
})
