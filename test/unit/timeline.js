/* eslint-env node, mocha */
/* global $pg_database, $should */
import uuid from 'uuid'
import knexCleaner from 'knex-cleaner'
import { dbAdapter, Timeline, User } from '../../app/models'


describe('Timeline', () => {
  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  describe('#create()', () => {
    it('should create without error', (done) => {
      const userId = uuid.v4()
      const timeline = new Timeline({
        name: 'name',
        userId
      })

      timeline.create()
        .then((timeline) => {
          timeline.should.be.an.instanceOf(Timeline)
          timeline.should.not.be.empty
          timeline.should.have.property('id')

          return dbAdapter.getTimelineById(timeline.id)
        })
        .then((newTimeline) => {
          newTimeline.should.be.an.instanceOf(Timeline)
          newTimeline.should.not.be.empty
          newTimeline.should.have.property('id')
          newTimeline.id.should.eql(timeline.id)
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should ignore whitespaces in name', (done) => {
      const userId = uuid.v4()
      const name = '   name    '
      const timeline = new Timeline({ name, userId })

      timeline.create()
        .then((timeline) => dbAdapter.getTimelineById(timeline.id))
        .then((newTimeline) => {
          newTimeline.should.be.an.instanceOf(Timeline)
          newTimeline.should.not.be.empty
          newTimeline.should.have.property('id')
          newTimeline.id.should.eql(timeline.id)
          newTimeline.name.should.eql(name.trim())
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should not create with empty name', (done) => {
      const userId = uuid.v4()
      const timeline = new Timeline({
        name: '',
        userId
      })

      timeline.create()
        .catch((e) => {
          e.message.should.eql('Invalid')
          done()
        })
    })
  })

  describe('#findById()', () => {
    it('should find timeline with a valid id', (done) => {
      const userId = uuid.v4()
      const timeline = new Timeline({
        name: 'name',
        userId
      })

      timeline.create()
        .then((timeline) => dbAdapter.getTimelineById(timeline.id))
        .then((newTimeline) => {
          newTimeline.should.be.an.instanceOf(Timeline)
          newTimeline.should.not.be.empty
          newTimeline.should.have.property('id')
          newTimeline.id.should.eql(timeline.id)
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should not find timeline with an invalid id', (done) => {
      const identifier = 'timeline:identifier'

      dbAdapter.getTimelineById(identifier)
        .then((timeline) => {
          $should.not.exist(timeline)
          done()
        })
        .catch((e) => { done(e) })
    })
  })

  describe('#getPosts()', () => {
    it('should return an empty list for an empty timeline', (done) => {
      const user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then((_user) => {
          const timeline = new Timeline({
            name:   'name',
            userId: _user.id
          })
          return timeline.create()
        })
        .then((timeline) => timeline.getPosts())
        .then((posts) => {
          posts.should.be.empty
          done()
        })
        .catch((e) => { done(e) })
    })
  })

  describe('#getSubscribers()', () => {
    let userA
      , userB

    beforeEach(async () => {
      userA = new User({ username: 'Luna', password: 'password' })
      userB = new User({ username: 'Mars', password: 'password' })

      await Promise.all([userA.create(), userB.create()])
    })

    it('should subscribe to timeline', (done) => {
      const attrs = { body: 'Post body' }

      userB.newPost(attrs)
        .then((newPost) => newPost.create())
        .then(() => userB.getPostsTimelineId())
        .then((timelineId) => userA.subscribeTo(timelineId))
        .then(() => userB.getPostsTimeline())
        .then((timeline) => timeline.getSubscribers())
        .then((users) => {
          users.should.not.be.empty
          users.length.should.eql(1)
          const user = users[0]
          user.should.have.property('id')
          user.id.should.eql(userA.id)
          done()
        })
        .catch((e) => { done(e) })
    })
  })
})
