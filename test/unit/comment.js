/* eslint-env node, mocha */
/* global $pg_database, $should */
import { isNull } from 'lodash'
import knexCleaner from 'knex-cleaner'
import { dbAdapter, Comment, Post, User } from '../../app/models'


describe('Comment', () => {
  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  describe('#update()', () => {
    let userA
      , comment
      , post

    beforeEach((done) => {
      userA = new User({
        username: 'Luna',
        password: 'password'
      })

      const postAttrs = { body: 'Post body' }

      userA.create()
        .then(() => { return userA.newPost(postAttrs) })
        .then((newPost) => newPost.create())
        .then((newPost) => {
          post = newPost
          const commentAttrs = {
            body:   'Comment body',
            postId: post.id
          }
          return userA.newComment(commentAttrs)
        })
        .then((newComment) => {
          comment = newComment
          return comment.create()
        })
        .then(() => { done() })
        .catch((e) => { done(e) })
    })

    it('should update without error', (done) => {
      const body = 'Body'
      const attrs = { body }

      comment.update(attrs)
        .then((newComment) => {
          newComment.should.be.an.instanceOf(Comment)
          newComment.should.not.be.empty
          newComment.should.have.property('body')
          newComment.body.should.eql(comment.body)
        })
        .then(() => { done() })
        .catch((e) => { done(e) })
    })
  })

  describe('#create()', () => {
    let user
      , post

    beforeEach((done) => {
      user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then((user) => user.getPostsTimelineId())
        .then((postsTimelineId) => {
          post = new Post({
            body:        'Post body',
            userId:      user.id,
            timelineIds: [postsTimelineId]
          })

          return post.create()
        })
        .then(() => { done() })
        .catch((e) => { done(e) })
    })

    it('should create without error', (done) => {
      const comment = new Comment({
        body:   'Comment body',
        userId: user.id,
        postId: post.id
      })

      comment.create()
        .then(() => {
          comment.should.be.an.instanceOf(Comment)
          comment.should.not.be.empty
          comment.should.have.property('id')

          return comment
        })
        .then((comment) => dbAdapter.getCommentById(comment.id))
        .then((newComment) => {
          newComment.should.be.an.instanceOf(Comment)
          newComment.should.not.be.empty
          newComment.should.have.property('id')
          newComment.id.should.eql(comment.id)
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should ignore whitespaces in body', (done) => {
      const body = '   Comment body    '
      const comment = new Comment({
        body,
        userId: user.id,
        postId: post.id
      })

      comment.create()
        .then(() => dbAdapter.getCommentById(comment.id))
        .then((newComment) => {
          newComment.should.be.an.instanceOf(Comment)
          newComment.should.not.be.empty
          newComment.should.have.property('id')
          newComment.id.should.eql(comment.id)
          newComment.body.should.eql(body.trim())
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should not create with empty body', (done) => {
      const comment = new Comment({
        body:   '',
        userId: user.id,
        postId: post.id
      })

      comment.create()
        .catch((e) => {
          e.message.should.eql('Comment text must not be empty')
          done()
        })
    })
  })

  describe('#findById()', () => {
    let user
      , post

    beforeEach((done) => {
      user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then((user) => user.getPostsTimelineId())
        .then((postsTimelineId) => {
          post = new Post({
            body:        'Post body',
            userId:      user.id,
            timelineIds: [postsTimelineId]
          })

          return post.create()
        })
        .then(() => { done() })
        .catch((e) => { done(e) })
    })

    it('should find comment with a valid id', (done) => {
      const comment = new Comment({
        body:   'Comment body',
        userId: user.id,
        postId: post.id
      })

      comment.create()
        .then(() => dbAdapter.getCommentById(comment.id))
        .then((newComment) => {
          newComment.should.be.an.instanceOf(Comment)
          newComment.should.not.be.empty
          newComment.should.have.property('id')
          newComment.id.should.eql(comment.id)
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should not find comment with invalid id', (done) => {
      const identifier = 'comment:identifier'

      dbAdapter.getCommentById(identifier)
        .then((comment) => {
          $should.not.exist(comment)
          done()
        })
        .catch((e) => { done(e) })
    })
  })

  describe('#destroy()', () => {
    let userA
      , post

    beforeEach((done) => {
      userA = new User({
        username: 'Luna',
        password: 'password'
      })

      const postAttrs = { body: 'Post body' }
      let comment

      userA.create()
        .then(() => userA.newPost(postAttrs))
        .then((newPost) => newPost.create())
        .then((newPost) => {
          post = newPost
          const commentAttrs = {
            body:   'Comment body',
            postId: post.id
          }
          return userA.newComment(commentAttrs)
        })
        .then((newComment) => {
          comment = newComment
          return comment.create()
        })
        .then(() => { done() })
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
