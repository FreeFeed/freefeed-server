/* eslint-env node, mocha */
/* global $pg_database, $should */
import uuid from 'uuid'
import knexCleaner from 'knex-cleaner'
import { dbAdapter, Timeline, User } from '../../app/models'


describe('Timeline', function () {
  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  describe('#create()', function () {
    it('should create without error', function (done) {
      var userId = uuid.v4()
      var timeline = new Timeline({
        name: 'name',
        userId
      })

      timeline.create()
        .then(function (timeline) {
          timeline.should.be.an.instanceOf(Timeline)
          timeline.should.not.be.empty
          timeline.should.have.property('id')

          return timeline
        })
        .then(function (timeline) { return dbAdapter.getTimelineById(timeline.id) })
        .then(function (newTimeline) {
          newTimeline.should.be.an.instanceOf(Timeline)
          newTimeline.should.not.be.empty
          newTimeline.should.have.property('id')
          newTimeline.id.should.eql(timeline.id)
        })
        .then(function () { done() })
        .catch((e) => { done(e) })
    })

    it('should ignore whitespaces in name', function (done) {
      var userId = uuid.v4()
      var name = '   name    '
      var timeline = new Timeline({ name, userId })

      timeline.create()
        .then(function (timeline) { return timeline })
        .then(function (timeline) { return dbAdapter.getTimelineById(timeline.id) })
        .then(function (newTimeline) {
          newTimeline.should.be.an.instanceOf(Timeline)
          newTimeline.should.not.be.empty
          newTimeline.should.have.property('id')
          newTimeline.id.should.eql(timeline.id)
          newTimeline.name.should.eql(name.trim())
        })
        .then(function () { done() })
        .catch((e) => { done(e) })
    })

    it('should not create with empty name', function (done) {
      var userId = uuid.v4()
      var timeline = new Timeline({
        name: '',
        userId
      })

      timeline.create()
        .catch(function (e) {
          e.message.should.eql('Invalid')
          done()
        })
    })
  })

  describe('#findById()', function () {
    it('should find timeline with a valid id', function (done) {
      var userId = uuid.v4()
      var timeline = new Timeline({
        name: 'name',
        userId
      })

      timeline.create()
        .then(function (timeline) { return timeline })
        .then(function (timeline) { return dbAdapter.getTimelineById(timeline.id) })
        .then(function (newTimeline) {
          newTimeline.should.be.an.instanceOf(Timeline)
          newTimeline.should.not.be.empty
          newTimeline.should.have.property('id')
          newTimeline.id.should.eql(timeline.id)
        })
        .then(function () { done() })
        .catch((e) => { done(e) })
    })

    it('should not find timeline with an invalid id', function (done) {
      var identifier = 'timeline:identifier'

      dbAdapter.getTimelineById(identifier)
        .then(function (timeline) {
          $should.not.exist(timeline)
        })
        .then(function () { done() })
        .catch((e) => { done(e) })
    })
  })

  describe('#getPosts()', function () {
    it('should return an empty list for an empty timeline', function (done) {
      var user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function (_user) {
          var timeline = new Timeline({
            name: 'name',
            userId: _user.id
          })
          return timeline.create()
        })
        .then(function (timeline) { return timeline.getPosts() })
        .then(function (posts) {
          posts.should.be.empty
        })
        .then(function () { done() })
        .catch((e) => { done(e) })
    })
  })

  describe('#getSubscribers()', function () {
    var userA
      , userB

    beforeEach(function (done) {
      userA = new User({
        username: 'Luna',
        password: 'password'
      })

      userB = new User({
        username: 'Mars',
        password: 'password'
      })

      userA.create()
        .then(function () { return userB.create() })
        .then(function () { done() })
        .catch((e) => { done(e) })
    })

    it('should subscribe to timeline', function (done) {
      var attrs = { body: 'Post body' }

      userB.newPost(attrs)
        .then(function (newPost) {
          return newPost.create()
        })
        .then(function () { return userB.getPostsTimelineId() })
        .then(function (timelineId) { return userA.subscribeTo(timelineId) })
        .then(function () { return userB.getPostsTimeline() })
        .then(function (timeline) { return timeline.getSubscribers() })
        .then(function (users) {
          users.should.not.be.empty
          users.length.should.eql(1)
          var user = users[0]
          user.should.have.property('id')
          user.id.should.eql(userA.id)
        })
        .then(function () { done() })
        .catch((e) => { done(e) })
    })
  })
})
