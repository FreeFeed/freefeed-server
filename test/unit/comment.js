/* eslint-env node, mocha */
/* global $pg_database, $should */
import { isNull } from 'lodash'
import knexCleaner from 'knex-cleaner'
import { dbAdapter, Comment, Post, User } from '../../app/models'


describe('Comment', function () {
  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  describe('#update()', function () {
    let userA
      , comment
      , post

    beforeEach(function (done) {
      userA = new User({
        username: 'Luna',
        password: 'password'
      })

      const postAttrs = { body: 'Post body' }

      userA.create()
        .then(function () { return userA.newPost(postAttrs) })
        .then(function (newPost) { return newPost.create() })
        .then(function (newPost) {
          post = newPost
          const commentAttrs = {
            body:   'Comment body',
            postId: post.id
          }
          return userA.newComment(commentAttrs)
        })
        .then(function (newComment) {
          comment = newComment
          return comment.create()
        })
        .then(function () { done() })
        .catch((e) => { done(e) })
    })

    it('should update without error', function (done) {
      const body = 'Body'
      const attrs = { body }

      comment.update(attrs)
        .then(function (newComment) {
          newComment.should.be.an.instanceOf(Comment)
          newComment.should.not.be.empty
          newComment.should.have.property('body')
          newComment.body.should.eql(comment.body)
        })
        .then(function () { done() })
        .catch((e) => { done(e) })
    })
  })

  describe('#create()', function () {
    let user
      , post

    beforeEach(function (done) {
      user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function (user) {
          return user.getPostsTimelineId();
        })
        .then(function (postsTimelineId) {
          post = new Post({
            body:        'Post body',
            userId:      user.id,
            timelineIds: [postsTimelineId]
          })

          return post.create()
        })
        .then(function () { done() })
        .catch((e) => { done(e) })
    })

    it('should create without error', function (done) {
      const comment = new Comment({
        body:   'Comment body',
        userId: user.id,
        postId: post.id
      })

      comment.create()
        .then(function () {
          comment.should.be.an.instanceOf(Comment)
          comment.should.not.be.empty
          comment.should.have.property('id')

          return comment
        })
        .then(function (comment) { return dbAdapter.getCommentById(comment.id) })
        .then(function (newComment) {
          newComment.should.be.an.instanceOf(Comment)
          newComment.should.not.be.empty
          newComment.should.have.property('id')
          newComment.id.should.eql(comment.id)
        })
        .then(function () { done() })
        .catch((e) => { done(e) })
    })

    it('should ignore whitespaces in body', function (done) {
      const body = '   Comment body    '
      const comment = new Comment({
        body,
        userId: user.id,
        postId: post.id
      })

      comment.create()
        .then(function () { return dbAdapter.getCommentById(comment.id) })
        .then(function (newComment) {
          newComment.should.be.an.instanceOf(Comment)
          newComment.should.not.be.empty
          newComment.should.have.property('id')
          newComment.id.should.eql(comment.id)
          newComment.body.should.eql(body.trim())
        })
        .then(function () { done() })
        .catch((e) => { done(e) })
    })

    it('should not create with empty body', function (done) {
      const comment = new Comment({
        body:   '',
        userId: user.id,
        postId: post.id
      })

      comment.create()
        .catch(function (e) {
          e.message.should.eql('Comment text must not be empty')
          done()
        })
    })
  })

  describe('#findById()', function () {
    let user
      , post

    beforeEach(function (done) {
      user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function (user) {
          return user.getPostsTimelineId();
        })
        .then(function (postsTimelineId) {
          post = new Post({
            body:        'Post body',
            userId:      user.id,
            timelineIds: [postsTimelineId]
          })

          return post.create()
        })
        .then(function () { done() })
        .catch((e) => { done(e) })
    })

    it('should find comment with a valid id', function (done) {
      const comment = new Comment({
        body:   'Comment body',
        userId: user.id,
        postId: post.id
      })

      comment.create()
        .then(function () { return dbAdapter.getCommentById(comment.id) })
        .then(function (newComment) {
          newComment.should.be.an.instanceOf(Comment)
          newComment.should.not.be.empty
          newComment.should.have.property('id')
          newComment.id.should.eql(comment.id)
        })
        .then(function () { done() })
        .catch((e) => { done(e) })
    })

    it('should not find comment with invalid id', function (done) {
      const identifier = 'comment:identifier'

      dbAdapter.getCommentById(identifier)
        .then(function (comment) {
          $should.not.exist(comment)
        })
        .then(function () { done() })
        .catch((e) => { done(e) })
    })
  })

  describe('#destroy()', function () {
    let userA
      , post

    beforeEach(function (done) {
      userA = new User({
        username: 'Luna',
        password: 'password'
      })

      const postAttrs = { body: 'Post body' }
      let comment

      userA.create()
        .then(function () { return userA.newPost(postAttrs) })
        .then(function (newPost) { return newPost.create() })
        .then(function (newPost) {
          post = newPost
          const commentAttrs = {
            body:   'Comment body',
            postId: post.id
          }
          return userA.newComment(commentAttrs)
        })
        .then(function (newComment) {
          comment = newComment
          return comment.create()
        })
        .then(function () { done() })
        .catch((e) => { done(e) })
    })

    it('should destroy comment', async () => {
      let comments = await post.getComments()

      const comment = comments[0]
      await comment.destroy()

      const oldComment = await dbAdapter.getCommentById(comment.id)
      isNull(oldComment).should.be.true

      comments = await post.getComments()
      comments.should.be.empty
    })
  })
})
