/*eslint-env node, mocha */
/*global $database */
import request from 'superagent'
import _ from 'lodash'
import knexCleaner from 'knex-cleaner'

import { getSingleton } from '../../app/app'
import * as funcTestHelper from './functional_test_helper'


describe("MutualFriends", function() {
  let app

  beforeEach(async () => {
    app = await getSingleton()
    await $database.flushdbAsync()
    await knexCleaner.clean($pg_database)
  })

  describe('user Luna, user Mars, and user Zeus', function() {
    var lunaContext = {}
    var marsContext = {}
    var zeusContext = {}

    beforeEach(funcTestHelper.createUserCtx(lunaContext, 'luna', 'pw'))
    beforeEach(funcTestHelper.createUserCtx(marsContext, 'mars', 'pw'))
    beforeEach(funcTestHelper.createUserCtx(zeusContext, 'zeus', 'pw'))

    describe('are mutual friends', function() {
      beforeEach(function(done) { funcTestHelper.subscribeToCtx(lunaContext, marsContext.username)(done) })
      beforeEach(function(done) { funcTestHelper.subscribeToCtx(lunaContext, zeusContext.username)(done) })
      beforeEach(function(done) { funcTestHelper.subscribeToCtx(marsContext, lunaContext.username)(done) })
      beforeEach(function(done) { funcTestHelper.subscribeToCtx(marsContext, zeusContext.username)(done) })
      beforeEach(function(done) { funcTestHelper.subscribeToCtx(zeusContext, marsContext.username)(done) })
      beforeEach(function(done) { funcTestHelper.subscribeToCtx(zeusContext, lunaContext.username)(done) })

      it('should not publish liked direct message to home feed of mutual friends', function(done) {
        var body = 'body'
        request
          .post(app.config.host + '/v1/posts')
          .send({ post: { body: body }, meta: { feeds: [marsContext.username] }, authToken: lunaContext.authToken })
          .end(function(err, res) {
            var post = res.body.posts
            request
              .post(app.config.host + '/v1/posts/' + post.id + '/like')
              .send({ authToken: lunaContext.authToken })
              .end(function(err, res) {
                funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, function(err, res) {
                  res.body.should.have.property('timelines')
                  res.body.timelines.should.have.property('name')
                  res.body.timelines.name.should.eql('RiverOfNews')
                  res.body.should.not.have.property('posts')
                  done()
                })
              })
          })
      })

      it('should not publish liked direct message to likes feed', function(done) {
        var body = 'body'
        request
          .post(app.config.host + '/v1/posts')
          .send({ post: { body: body }, meta: { feeds: [marsContext.username] }, authToken: lunaContext.authToken })
          .end(function(err, res) {
            var post = res.body.posts
            request
              .post(app.config.host + '/v1/posts/' + post.id + '/like')
              .send({ authToken: lunaContext.authToken })
              .end(function(err, res) {
                funcTestHelper.getTimeline('/v1/timelines/' + lunaContext.username + '/likes', lunaContext.authToken, function(err, res) {
                  res.body.should.have.property('timelines')
                  res.body.timelines.should.have.property('name')
                  res.body.timelines.name.should.eql('Likes')
                  res.body.should.not.have.property('posts')
                  done()
                })
              })
          })
      })

      it('should not publish commented direct message to home feed of mutual friends', function(done) {
        var body = 'body'
        request
          .post(app.config.host + '/v1/posts')
          .send({ post: { body: body }, meta: { feeds: [marsContext.username] }, authToken: lunaContext.authToken })
          .end(function(err, res) {
            var post = res.body.posts
            funcTestHelper.createComment(body, post.id, lunaContext.authToken, function(err, res) {
              funcTestHelper.getTimeline('/v1/timelines/home', zeusContext.authToken, function(err, res) {
                res.body.should.have.property('timelines')
                res.body.timelines.should.have.property('name')
                res.body.timelines.name.should.eql('RiverOfNews')
                res.body.should.not.have.property('posts')
                done()
              })
            })
          })
      })

      it('should not publish commented direct message to comments feed', function(done) {
        var body = 'body'
        request
          .post(app.config.host + '/v1/posts')
          .send({ post: { body: body }, meta: { feeds: [marsContext.username] }, authToken: lunaContext.authToken })
          .end(function(err, res) {
            var post = res.body.posts
            funcTestHelper.createComment(body, post.id, lunaContext.authToken, function(err, res) {
              funcTestHelper.getTimeline('/v1/timelines/' + lunaContext.username + '/comments', lunaContext.authToken, function(err, res) {
                res.body.should.have.property('timelines')
                res.body.timelines.should.have.property('name')
                res.body.timelines.name.should.eql('Comments')
                res.body.should.not.have.property('posts')
                done()
              })
            })
          })
      })

      it('should not comment on direct message unless you are recipient', function(done) {
        var body = 'body'
        request
          .post(app.config.host + '/v1/posts')
          .send({ post: { body: body }, meta: { feeds: [marsContext.username] }, authToken: lunaContext.authToken })
          .end(function(err, res) {
            var post = res.body.posts
            funcTestHelper.createComment(body, post.id, zeusContext.authToken, function(err, res) {
              res.body.should.not.be.empty
              res.body.should.have.property('err')
              res.body.err.should.eql('Not found')
              done()
            })
          })
      })

      it('should not like direct message unless you are recipient', function(done) {
        var body = 'body'
        request
          .post(app.config.host + '/v1/posts')
          .send({ post: { body: body }, meta: { feeds: [marsContext.username] }, authToken: lunaContext.authToken })
          .end(function(err, res) {
            var post = res.body.posts
            request
              .post(app.config.host + '/v1/posts/' + post.id + '/like')
              .send({ authToken: zeusContext.authToken })
              .end(function(err, res) {
                res.body.should.not.be.empty
                res.body.should.have.property('err')
                res.body.err.should.eql('Not found')
                done()
              })
          })
      })
    })
  })
})
