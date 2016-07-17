/* eslint-env node, mocha */
/* global $pg_database */
import request from 'superagent'
import knexCleaner from 'knex-cleaner'

import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub } from '../../app/models'
import * as funcTestHelper from './functional_test_helper'


describe('MutualFriends', () => {
  let app

  before(async () => {
    app = await getSingleton()
    PubSub.setPublisher(new DummyPublisher())
  })

  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  describe('user Luna, user Mars, and user Zeus', () => {
    const lunaContext = {}
    const marsContext = {}
    const zeusContext = {}

    beforeEach(funcTestHelper.createUserCtx(lunaContext, 'luna', 'pw'))
    beforeEach(funcTestHelper.createUserCtx(marsContext, 'mars', 'pw'))
    beforeEach(funcTestHelper.createUserCtx(zeusContext, 'zeus', 'pw'))

    describe('are mutual friends', () => {
      beforeEach((done) => { funcTestHelper.subscribeToCtx(lunaContext, marsContext.username)(done) })
      beforeEach((done) => { funcTestHelper.subscribeToCtx(lunaContext, zeusContext.username)(done) })
      beforeEach((done) => { funcTestHelper.subscribeToCtx(marsContext, lunaContext.username)(done) })
      beforeEach((done) => { funcTestHelper.subscribeToCtx(marsContext, zeusContext.username)(done) })
      beforeEach((done) => { funcTestHelper.subscribeToCtx(zeusContext, marsContext.username)(done) })
      beforeEach((done) => { funcTestHelper.subscribeToCtx(zeusContext, lunaContext.username)(done) })

      it('should not publish liked direct message to home feed of mutual friends', (done) => {
        const body = 'body'
        request
          .post(`${app.config.host}/v1/posts`)
          .send({ post: { body }, meta: { feeds: [marsContext.username] }, authToken: lunaContext.authToken })
          .end((err, res) => {
            const post = res.body.posts
            request
              .post(`${app.config.host}/v1/posts/${post.id}/like`)
              .send({ authToken: lunaContext.authToken })
              .end(() => {
                funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, (err, res) => {
                  res.body.should.have.property('timelines')
                  res.body.timelines.should.have.property('name')
                  res.body.timelines.name.should.eql('RiverOfNews')
                  res.body.should.not.have.property('posts')
                  done()
                })
              })
          })
      })

      it('should not publish liked direct message to likes feed', (done) => {
        const body = 'body'
        request
          .post(`${app.config.host}/v1/posts`)
          .send({ post: { body }, meta: { feeds: [marsContext.username] }, authToken: lunaContext.authToken })
          .end((err, res) => {
            const post = res.body.posts
            request
              .post(`${app.config.host}/v1/posts/${post.id}/like`)
              .send({ authToken: lunaContext.authToken })
              .end(() => {
                funcTestHelper.getTimeline(`/v1/timelines/${lunaContext.username}/likes`, lunaContext.authToken, (err, res) => {
                  if (err) {
                    done(err);
                    return;
                  }

                  try {
                    res.body.should.have.property('timelines')
                    res.body.timelines.should.have.property('name')
                    res.body.timelines.name.should.eql('Likes')
                    res.body.should.not.have.property('posts')
                    done()
                  } catch (e) {
                    done(e)
                  }
                })
              })
          })
      })

      it('should not publish commented direct message to home feed of mutual friends', (done) => {
        const body = 'body'
        request
          .post(`${app.config.host}/v1/posts`)
          .send({ post: { body }, meta: { feeds: [marsContext.username] }, authToken: lunaContext.authToken })
          .end((err, res) => {
            const post = res.body.posts
            funcTestHelper.createComment(body, post.id, lunaContext.authToken, () => {
              funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, (err, res) => {
                try {
                  res.body.should.have.property('timelines')
                  res.body.timelines.should.have.property('name')
                  res.body.timelines.name.should.eql('RiverOfNews')
                  res.body.should.not.have.property('posts')
                  done()
                } catch (e) {
                  done(e)
                }
              })
            })
          })
      })

      it('should not publish commented direct message to comments feed', (done) => {
        const body = 'body'
        request
          .post(`${app.config.host}/v1/posts`)
          .send({ post: { body }, meta: { feeds: [marsContext.username] }, authToken: lunaContext.authToken })
          .end((err, res) => {
            const post = res.body.posts
            funcTestHelper.createComment(body, post.id, lunaContext.authToken, () => {
              funcTestHelper.getTimeline(`/v1/timelines/${lunaContext.username}/comments`, lunaContext.authToken, (err, res) => {
                if (err) {
                  done(err);
                  return;
                }

                try {
                  res.body.should.have.property('timelines')
                  res.body.timelines.should.have.property('name')
                  res.body.timelines.name.should.eql('Comments')
                  res.body.should.not.have.property('posts')
                  done()
                } catch (e) {
                  done(e)
                }
              })
            })
          })
      })

      it('should not comment on direct message unless you are recipient', (done) => {
        const body = 'body'
        request
          .post(`${app.config.host}/v1/posts`)
          .send({ post: { body }, meta: { feeds: [marsContext.username] }, authToken: lunaContext.authToken })
          .end((err, res) => {
            const post = res.body.posts
            funcTestHelper.createComment(body, post.id, zeusContext.authToken, (err, res) => {
              try {
                res.body.should.not.be.empty
                res.body.should.have.property('err')
                res.body.err.should.eql('Not found')
                done()
              } catch (e) {
                done(e)
              }
            })
          })
      })

      it('should not like direct message unless you are recipient', (done) => {
        const body = 'body'
        request
          .post(`${app.config.host}/v1/posts`)
          .send({ post: { body }, meta: { feeds: [marsContext.username] }, authToken: lunaContext.authToken })
          .end((err, res) => {
            const post = res.body.posts
            request
              .post(`${app.config.host}/v1/posts/${post.id}/like`)
              .send({ authToken: zeusContext.authToken })
              .end((err, res) => {
                try {
                  res.body.should.not.be.empty
                  res.body.should.have.property('err')
                  res.body.err.should.eql(`Can't find post`)
                  done()
                } catch (e) {
                  done(e)
                }
              })
          })
      })
    })
  })
})
