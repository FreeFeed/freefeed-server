/* eslint-env node, mocha */
/* global $pg_database */
import request from 'superagent'
import knexCleaner from 'knex-cleaner'

import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub } from '../../app/models'
import * as funcTestHelper from './functional_test_helper'


describe('TimelinesController', () => {
  let app

  before(async () => {
    app = await getSingleton()
    PubSub.setPublisher(new DummyPublisher())
  })

  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  describe('#home()', () => {
    const context = {}

    beforeEach(funcTestHelper.createUserCtx(context, 'Luna', 'password'))

    it('should return empty River Of News', (done) => {
      funcTestHelper.getTimeline('/v1/timelines/home', context.authToken, (err, res) => {
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

    it('should not return River Of News for unauthenticated user', (done) => {
      funcTestHelper.getTimeline('/v1/timelines/home', null, (err) => {
        err.should.not.be.empty
        err.status.should.eql(401)
        done()
      })
    })

    it('should return River of News with one post', (done) => {
      const body = 'Post body'

      funcTestHelper.createPost(context, body)((err, res) => {
        res.body.should.not.be.empty
        res.body.should.have.property('posts')
        res.body.posts.should.have.property('body')
        res.body.posts.body.should.eql(body)

        funcTestHelper.getTimeline('/v1/timelines/home', context.authToken, (err, res) => {
          res.should.not.be.empty
          res.body.should.not.be.empty
          res.body.should.have.property('timelines')
          res.body.timelines.should.have.property('name')
          res.body.timelines.name.should.eql('RiverOfNews')
          res.body.timelines.should.have.property('posts')
          res.body.timelines.posts.length.should.eql(1)
          res.body.should.have.property('posts')
          res.body.posts.length.should.eql(1)
          res.body.posts[0].body.should.eql(body)
          done()
        })
      })
    })
  })

  describe('#posts()', () => {
    const context = {}

    beforeEach(funcTestHelper.createUserCtx(context, 'Luna', 'password'))
    beforeEach((done) => { funcTestHelper.createPost(context, 'Post body')(done) })

    it('should return posts timeline', (done) => {
      funcTestHelper.getTimeline(`/v1/timelines/${context.username}`, context.authToken, (err, res) => {
        res.should.not.be.empty
        res.body.should.not.be.empty
        res.body.should.have.property('timelines')
        res.body.timelines.should.have.property('name')
        res.body.timelines.name.should.eql('Posts')
        res.body.timelines.should.have.property('posts')
        res.body.timelines.posts.length.should.eql(1)
        res.body.should.have.property('posts')
        res.body.posts.length.should.eql(1)
        res.body.posts[0].body.should.eql(context.post.body)
        done()
      })
    })
  })

  describe('#pagination', () => {
    const context = {}

    beforeEach(funcTestHelper.createUserCtx(context, 'Luna', 'password'))
    beforeEach((done) => { funcTestHelper.createPost(context, 'Post one')(done) })
    beforeEach((done) => { funcTestHelper.createPost(context, 'Post two')(done) })
    beforeEach((done) => { funcTestHelper.createPost(context, 'Post three')(done) })

    it('should respect explicit pagination limits', (done) => {
      funcTestHelper.getTimelinePaged(`/v1/timelines/${context.username}`, context.authToken, 0, 1, (err, res) => {
        res.should.not.be.empty
        res.body.should.not.be.empty
        res.body.should.have.property('timelines')
        res.body.timelines.should.have.property('name')
        res.body.timelines.name.should.eql('Posts')
        res.body.timelines.should.have.property('posts')
        res.body.timelines.posts.length.should.eql(1)
        res.body.should.have.property('posts')
        res.body.posts.length.should.eql(1)
        res.body.posts[0].body.should.eql('Post three') // Latest post first
        done()
      })
    })

    it('should respect pagination offset', (done) => {
      funcTestHelper.getTimelinePaged(`/v1/timelines/${context.username}`, context.authToken, 1, 1, (err, res) => {
        res.should.not.be.empty
        res.body.should.not.be.empty
        res.body.should.have.property('timelines')
        res.body.timelines.should.have.property('name')
        res.body.timelines.name.should.eql('Posts')
        res.body.timelines.should.have.property('posts')
        res.body.timelines.posts.length.should.eql(1)
        res.body.should.have.property('posts')
        res.body.posts.length.should.eql(1)
        res.body.posts[0].body.should.eql('Post two')
        done()
      })
    })
  })

  describe('#likes()', () => {
    const context = {}
    const marsContext = {}

    beforeEach(funcTestHelper.createUserCtx(context, 'Luna', 'password'))
    beforeEach((done) => { funcTestHelper.createPost(context, 'Post body')(done) })
    beforeEach(funcTestHelper.createUserCtx(marsContext, 'mars', 'password2'))
    beforeEach((done) => {
      request
        .post(`${app.config.host}/v1/posts/${context.post.id}/like`)
        .send({ authToken: marsContext.authToken })
        .end(() => {
          done()
        })
    })

    it('should return likes timeline', (done) => {
      funcTestHelper.getTimeline(`/v1/timelines/${marsContext.username}/likes`, context.authToken, (err, res) => {
        res.should.not.be.empty
        res.body.should.not.be.empty
        res.body.should.have.property('timelines')
        res.body.timelines.should.have.property('name')
        res.body.timelines.name.should.eql('Likes')
        res.body.timelines.should.have.property('posts')
        res.body.timelines.posts.length.should.eql(1)
        res.body.should.have.property('posts')
        res.body.posts.length.should.eql(1)
        res.body.posts[0].body.should.eql(context.post.body)
        done()
      })
    })

    it('should return empty likes timeline after un-like', (done) => {
      request
        .post(`${app.config.host}/v1/posts/${context.post.id}/unlike`)
        .send({ authToken: context.authToken })
        .end(() => {
          funcTestHelper.getTimeline(`/v1/timelines/${context.username}/likes`, context.authToken, (err, res) => {
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
  })

  describe('#comments()', () => {
    const context = {}
    let comment
    let comment2

    beforeEach(funcTestHelper.createUserCtx(context, 'Luna', 'password'))

    beforeEach((done) => { funcTestHelper.createPost(context, 'Post body')(done) })
    beforeEach((done) => {
      const body = 'Comment'

      funcTestHelper.createComment(body, context.post.id, context.authToken, (err, res) => {
        comment = res.body.comments

        funcTestHelper.createComment(body, context.post.id, context.authToken, (err, res) => {
          comment2 = res.body.comments

          done()
        })
      })
    })

    it('should return comments timeline', (done) => {
      funcTestHelper.getTimeline(`/v1/timelines/${context.username}/comments`, context.authToken, (err, res) => {
        res.should.not.be.empty
        res.body.should.not.be.empty
        res.body.should.have.property('timelines')
        res.body.timelines.should.have.property('name')
        res.body.timelines.name.should.eql('Comments')
        res.body.timelines.should.have.property('posts')
        res.body.timelines.posts.length.should.eql(1)
        res.body.should.have.property('posts')
        res.body.posts.length.should.eql(1)
        res.body.posts[0].body.should.eql(context.post.body)
        done()
      })
    })


    it('should clear comments timeline only after all comments are deleted', (done) => {
      funcTestHelper.removeComment(comment.id, context.authToken, (err, res) => {
        res.body.should.be.empty
        res.status.should.eql(200)

        funcTestHelper.getTimeline(`/v1/timelines/${context.username}/comments`, context.authToken, (err, res) => {
          res.should.not.be.empty
          res.body.should.not.be.empty
          res.body.should.have.property('timelines')
          res.body.timelines.should.have.property('name')
          res.body.timelines.name.should.eql('Comments')
          res.body.timelines.should.have.property('posts')
          res.body.timelines.posts.length.should.eql(1)
          res.body.should.have.property('posts')
          res.body.posts.length.should.eql(1)
          res.body.posts[0].body.should.eql(context.post.body)

          // now remove 2nd comment
          funcTestHelper.removeComment(comment2.id, context.authToken, (err, res) => {
            res.body.should.be.empty
            res.status.should.eql(200)

            funcTestHelper.getTimeline(`/v1/timelines/${context.username}/comments`, context.authToken, (err, res) => {
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
      })
    })
  })
})
