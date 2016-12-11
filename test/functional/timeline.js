/* eslint-env node, mocha */
/* global $pg_database */
import request from 'superagent'
import knexCleaner from 'knex-cleaner'
import expect from 'unexpected';

import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { dbAdapter, PubSub } from '../../app/models'
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
    let context = {}

    beforeEach(async () => {
      context = await funcTestHelper.createUserAsync('Luna', 'password')
    })

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
    let context = {}
    let post = {}

    beforeEach(async () => {
      context = await funcTestHelper.createUserAsync('Luna', 'password')
      post = await funcTestHelper.createAndReturnPost(context, 'Post body')
    })

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
        res.body.posts[0].body.should.eql(post.body)
        done()
      })
    })

    it('should respond with 404 for "deleted" user', async () => {
      await dbAdapter.updateUser(context.user.id, { hashedPassword: '' });
      return expect(funcTestHelper.getUserFeed(context), 'to be rejected with', new Error('HTTP/1.1 404'));
    });
  })

  describe('#pagination', () => {
    let context = {}

    beforeEach(async () => {
      context = await funcTestHelper.createUserAsync('Luna', 'password')

      // order is important
      await funcTestHelper.createAndReturnPost(context, 'Post one')
      await funcTestHelper.createAndReturnPost(context, 'Post two')
      await funcTestHelper.createAndReturnPost(context, 'Post three')
    })

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
    let context = {}
    let marsContext = {}
    let post = {}

    beforeEach(async () => {
      [context, marsContext] = await Promise.all([
        funcTestHelper.createUserAsync('Luna', 'password'),
        funcTestHelper.createUserAsync('mars', 'password2')
      ]);

      post = await funcTestHelper.createAndReturnPost(context, 'Post body')
      await funcTestHelper.like(post.id, marsContext.authToken)
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
        res.body.posts[0].body.should.eql(post.body)
        done()
      })
    })

    it('should return empty likes timeline after un-like', (done) => {
      request
        .post(`${app.context.config.host}/v1/posts/${post.id}/unlike`)
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


    it('should respond with 404 for "deleted" user', async () => {
      await dbAdapter.updateUser(context.user.id, { hashedPassword: '' });
      return expect(funcTestHelper.getUserLikesFeed(context), 'to be rejected with', new Error('HTTP/1.1 404'));
    });
  })

  describe('#comments()', () => {
    let context = {}
    let post = {}
    let comment
    let comment2

    beforeEach(async () => {
      context = await funcTestHelper.createUserAsync('Luna', 'password')
      post = await funcTestHelper.createAndReturnPost(context, 'Post body')

      const body = 'Comment'
      const response1 = await funcTestHelper.createCommentAsync(context, post.id, body)
      const response2 = await funcTestHelper.createCommentAsync(context, post.id, body)

      comment = (await response1.json()).comments
      comment2 = (await response2.json()).comments
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
        res.body.posts[0].body.should.eql(post.body)
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
          res.body.posts[0].body.should.eql(post.body)

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

    it('should respond with 404 for "deleted" user', async () => {
      await dbAdapter.updateUser(context.user.id, { hashedPassword: '' });
      return expect(funcTestHelper.getUserCommentsFeed(context), 'to be rejected with', new Error('HTTP/1.1 404'));
    });
  })
})
