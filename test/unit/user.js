/* eslint-env node, mocha */
/* global $pg_database, $should */
import { expect } from 'chai'
import knexCleaner from 'knex-cleaner'

import { dbAdapter, Post, Timeline, User } from '../../app/models'


describe('User', () => {
  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  describe('#validPassword()', () => {
    it('should validate valid password', (done) => {
      const user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then((user) => user.validPassword('password'))
        .then((valid) => {
          valid.should.eql(true)
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should not validate invalid password', (done) => {
      const user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then((user) => user.validPassword('drowssap'))
        .then((valid) => {
          valid.should.eql(false)
          done()
        })
        .catch((e) => { done(e) })
    })
  })

  describe('#isValidUsername()', () => {
    const valid = [
      'luna', 'lun', '12345', 'hello1234',
      ' group', 'group ',  // automatically trims
      'aaaaaaaaaaaaaaaaaaaaaaaaa'  // 25 chars is ok
    ]

    let i = 1
    valid.forEach((username) => {
      it(`should allow username '${username}'`, (done) => {
        const user = new User({
          username,
          screenName: 'test',
          password:   'password',
          email:      `user+${i++}@example.com`
        })

        user.create()
          .then(() => { done() })
          .catch((e) => { done(e) })
      })
    })

    const invalid = [
      'lu', '-12345', 'luna-', 'hel--lo', 'save-our-snobs', 'абизьян',
      'gr oup', '',
      'aaaaaaaaaaaaaaaaaaaaaaaaaa'  // 26 chars is 1 char too much
    ]
    invalid.forEach((username) => {
      it(`should not allow invalid username ${username}`, async () => {
        const user = new User({
          username,
          screenName: 'test',
          password:   'password',
          email:      'user@example.com'
        })

        try {
          await user.create()
        } catch (e) {
          e.message.should.eql('Invalid username')
          return
        }

        throw new Error('FAIL')
      })
    })
  })

  describe('#isValidDescription()', () => {
    const valid = [
      '',
      "Earth's only natural satellite",
      "window.alert('Ha-ha-ha!')",
      ' natural', 'satellite ', // automatically trims
      '!'.repeat(1500) // 1500 characters is OK
    ]

    let i = 1
    valid.forEach((description) => {
      it(`should allow description ${i++}`, async () => {
        const user = new User({
          username:   `username${i}`,
          screenName: 'test',
          password:   'password',
          email:      `user+${i++}@example.com`
        })

        await user.create()

        const updatedUser = await user.update({ description })

        updatedUser.should.be.an.instanceOf(User)
        updatedUser.should.not.be.empty
        updatedUser.should.have.property('id')
        updatedUser.description.should.eql(description.trim())
      })
    })

    const invalid = [
      '!'.repeat(1501) // 1501 characters is NOT OK
    ]

    invalid.forEach((description) => {
      it('should not allow too long description', async () => {
        const user = new User({
          username:   `username`,
          screenName: 'test',
          password:   'password',
          email:      'user@example.com'
        })

        await user.create()

        try {
          await user.update({ description })
        } catch (e) {
          e.message.should.eql('Description is too long')
          return
        }

        throw new Error('FAIL')
      })
    })
  })

  describe('#validEmail()', () => {
    // @todo Provide fixtures to validate various email formats
    it('should validate syntactically correct email', (done) => {
      const user = new User({
        username: 'Luna',
        password: 'password',
        email:    'user@example.com'
      })

      user.create()
        .then(() => { done() })
        .catch((e) => { done(e) })
    })

    it('should validate without email', (done) => {
      const user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(() => { done() })
        .catch((e) => { done(e) })
    })

    it('should not validate syntactically incorrect email', async () => {
      const user = new User({
        username: 'Luna',
        password: 'password',
        email:    'user2@.example..com'
      })

      try {
        await user.create()
      } catch (e) {
        expect(e.message).to.equal('Invalid email');
        return;
      }

      throw new Error('FAIL (should not allow user with invalid email)')
    })

    it('should not allow 2 users with same email', async () => {
      const user1 = new User({
        username: 'Luna1',
        password: 'password',
        email:    'email@example.com'
      })

      const user2 = new User({
        username: 'Luna2',
        password: 'password',
        email:    'email@example.com'
      })

      await user1.create()

      try {
        await user2.create()
      } catch (e) {
        expect(e.message).to.equal('Invalid email')
        return
      }

      throw new Error(`FAIL (should not allow 2 users for same email)`)
    })
  })

  describe('#update()', () => {
    it('should update without error', (done) => {
      const screenName = 'Mars'
      const description = 'The fourth planet from the Sun and the second smallest planet in the Solar System, after Mercury.'

      const user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then((user) => user.update({ screenName, description }))
        .then((newUser) => {
          newUser.should.be.an.instanceOf(User)
          newUser.should.not.be.empty
          newUser.should.have.property('id')
          newUser.screenName.should.eql(screenName)
          newUser.description.should.eql(description)
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should update without email', (done) => {
      const user = new User({
        username:   'Luna',
        screenName: 'luna',
        password:   'password',
        email:      'test@example.com'
      })

      user.create()
        .then((user) => user.update({ email: null }))
        .then((newUser) => {
          newUser.should.be.an.instanceOf(User)
          newUser.should.not.be.empty
          newUser.should.have.property('id')
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should update without screenName', (done) => {
      const screenName = 'Luna'
      const user = new User({
        username: 'Luna',
        screenName,
        password: 'password'
      })

      user.create()
        .then((user) => user.update({}))
        .then((newUser) => {
          newUser.should.be.an.instanceOf(User)
          newUser.should.not.be.empty
          newUser.should.have.property('id')
          newUser.screenName.should.eql(screenName)
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should not update with blank screenName', (done) => {
      const user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then((user) => user.update({ screenName: '' }))
        .then(() => { done(new Error('FAIL')) })
        .catch((e) => {
          e.message.should.eql(`"" is not a valid display name. Names must be between 3 and 25 characters long.`)
          done()
        })
    })
  })

  describe('#create()', () => {
    it('should create without error', (done) => {
      const user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then((user) => {
          user.should.be.an.instanceOf(User)
          user.should.not.be.empty
          user.should.have.property('id')

          return dbAdapter.getUserById(user.id)
        })
        .then((newUser) => {
          newUser.should.be.an.instanceOf(User)
          newUser.should.not.be.empty
          newUser.should.have.property('id')
          newUser.id.should.eql(user.id)
          newUser.should.have.property('type')
          newUser.type.should.eql('user')
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should create with an email address', (done) => {
      const user = new User({
        username: 'Luna',
        email:    'luna@example.com',
        password: 'password'
      })

      user.create()
        .then((user) => {
          user.should.be.an.instanceOf(User)
          user.should.not.be.empty
          user.should.have.property('id')

          return dbAdapter.getUserById(user.id)
        })
        .then((newUser) => {
          newUser.should.be.an.instanceOf(User)
          newUser.should.not.be.empty
          newUser.should.have.property('id')
          newUser.id.should.eql(user.id)
          newUser.should.have.property('type')
          newUser.type.should.eql('user')
          newUser.should.have.property('email')
          newUser.email.should.eql(user.email)
          done();
        })
        .catch((e) => { done(e) })
    })

    it('should ignore whitespaces in username', (done) => {
      const username = ' Luna  '
      const user = new User({
        username,
        password: 'password'
      })

      user.create()
        .then((user) => {
          user.should.be.an.instanceOf(User)
          user.should.not.be.empty
          user.should.have.property('id')

          return dbAdapter.getUserById(user.id)
        })
        .then((newUser) => {
          newUser.should.be.an.instanceOf(User)
          newUser.should.not.be.empty
          newUser.should.have.property('id')
          newUser.id.should.eql(user.id)
          newUser.username.should.eql(username.trim().toLowerCase())
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should not create with empty password', (done) => {
      const user = new User({
        username: 'Luna',
        password: ''
      })

      user.create()
        .then(() => { done(new Error('FAIL')) })
        .catch((e) => {
          e.message.should.eql('Password cannot be blank')
          done()
        })
    })

    it('should not create two users with the same username', (done) => {
      const userA = new User({
        username: 'Luna',
        password: 'password'
      })

      const userB = new User({
        username: 'luna',
        password: 'password'
      })

      userA.create()
        .then(() => userB.create())
        .then(() => { done(new Error('FAIL')) })
        .catch((e) => {
          e.message.should.eql('Already exists')
          done()
        })
    })

    it('should not create user from stop-list', async () => {
      const user = new User({
        username: 'Public',
        password: 'password'
      })

      try {
        await user.create()
      } catch (e) {
        e.message.should.eql('Invalid username')
        return
      }

      throw new Error(`FAIL ("Public" username is in a stop-list. should not be allowed)`)
    })
  })

  describe('#findByEmail()', () => {
    it('should find a user by email', async () => {
      const user = new User({
        username: 'Luna',
        password: 'password',
        email:    'luna@example.com'
      })

      await user.create()
      await user.update({ email: user.email })

      const newUser = await dbAdapter.getUserByEmail(user.email)

      newUser.should.be.an.instanceOf(User)
      newUser.should.not.be.empty
      newUser.should.have.property('id')
      newUser.id.should.eql(user.id)
    })

    it('should not find a user by invalid email', (done) => {
      const user = new User({
        username: 'Luna',
        password: 'password',
        email:    'luna@example.com'
      })

      user.create()
        .then((user) => user.update({ email: user.email }))
        .then(() => dbAdapter.getUserByEmail('noreply@example.com'))
        .then((user) => {
          expect(user).to.be.a('null')
          done()
        })
        .catch((e) => { done(e) })
    })
  })

  describe('#findByResetToken()', () => {
    it('should find a user by reset token', (done) => {
      const user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then((user) => user.updateResetPasswordToken())
        .then((token) => dbAdapter.getUserByResetToken(token))
        .then((newUser) => {
          newUser.should.be.an.instanceOf(User)
          newUser.should.not.be.empty
          newUser.should.have.property('id')
          newUser.id.should.eql(user.id)
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should not find a user by invalid reset token', (done) => {
      const user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then((user) => user.updateResetPasswordToken())
        .then(() => dbAdapter.getUserByResetToken('token'))
        .then((e) => {
          expect(e).to.be.a('null')
          done()
        })
        .catch((e) => { done(e) })
    })
  })

  describe('#findById()', () => {
    it('should not find user with an invalid id', (done) => {
      const identifier = 'user:identifier'

      dbAdapter.getUserById(identifier)
        .then((user) => {
          $should.not.exist(user)
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should find user with a valid id', (done) => {
      const user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then((user) => dbAdapter.getUserById(user.id))
        .then((newUser) => {
          newUser.should.be.an.instanceOf(User)
          newUser.should.not.be.empty
          newUser.should.have.property('id')
          newUser.id.should.eql(user.id)
          done()
        })
        .catch((e) => { done(e) })
    })
  })

  describe('#findByUsername()', () => {
    it('should find user with a valid username', (done) => {
      const user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then((user) => dbAdapter.getUserByUsername(user.username))
        .then((newUser) => {
          newUser.should.be.an.instanceOf(User)
          newUser.should.not.be.empty
          newUser.should.have.property('username')
          newUser.username.should.eql(user.username.toLowerCase())
          done()
        })
        .catch((e) => { done(e) })
    })
  })

  describe('#getRiverOfNews()', () => {
    it('should get river of news', (done) => {
      const user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then((user) => user.getRiverOfNewsTimeline())
        .then((timeline) => {
          timeline.should.be.an.instanceOf(Timeline)
          timeline.should.not.be.empty
          timeline.should.have.property('name')
          timeline.name.should.eql('RiverOfNews')
          done()
        })
        .catch((e) => { done(e) })
    })
  })

  describe('#getLikesTimeline()', () => {
    it('should get likes timeline', (done) => {
      const user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then((user) => user.getLikesTimeline())
        .then((timeline) => {
          timeline.should.be.an.instanceOf(Timeline)
          timeline.should.not.be.empty
          timeline.should.have.property('name')
          timeline.name.should.eql('Likes')
          done()
        })
        .catch((e) => { done(e) })
    })
  })

  describe('#getPostsTimeline()', () => {
    it('should get posts timeline', (done) => {
      const user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then((user) => user.getPostsTimeline())
        .then((timeline) => {
          timeline.should.be.an.instanceOf(Timeline)
          timeline.should.not.be.empty
          timeline.should.have.property('name')
          timeline.name.should.eql('Posts')
          done()
        })
        .catch((e) => { done(e) })
    })
  })

  describe('#getCommentsTimeline()', () => {
    it('should get comments timeline', (done) => {
      const user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then((user) => user.getCommentsTimeline())
        .then((timeline) => {
          timeline.should.be.an.instanceOf(Timeline)
          timeline.should.not.be.empty
          timeline.should.have.property('name')
          timeline.name.should.eql('Comments')
          done()
        })
        .catch((e) => { done(e) })
    })
  })

  describe('#getMyDiscussionsTimeline()', () => {
    let user

    beforeEach(async () => {
      user = new User({ username: 'Luna', password: 'password' })
      await user.create()
    })

    it('should get my discussions timeline', (done) => {
      user.getMyDiscussionsTimeline()
        .then((timeline) => {
          timeline.should.be.an.instanceOf(Timeline)
          timeline.should.not.be.empty
          timeline.should.have.property('name')
          timeline.name.should.eql('MyDiscussions')
          timeline.should.have.property('id')
          timeline.id.should.eql(user.id)
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should include post to my discussions timeline', (done) => {
      let post
      const attrs = { body: 'Post body' }
      user.newPost(attrs)
        .then((newPost) => {
          post = newPost
          return newPost.create()
        })
        .then((post) => post.addLike(user))
        .then(() => user.getMyDiscussionsTimeline())
        .then((timeline) => {
          timeline.should.be.an.instanceOf(Timeline)
          timeline.should.not.be.empty
          timeline.should.have.property('name')
          timeline.name.should.eql('MyDiscussions')

          return timeline.getPosts()
        })
        .then((posts) => {
          posts.should.not.be.empty
          posts.length.should.eql(1)
          const newPost = posts[0]
          newPost.should.have.property('id')
          newPost.id.should.eql(post.id)
          done()
        })
        .catch((e) => { done(e) })
    })
  })

  describe('#getTimelines()', () => {
    it('should return user timelines after user creation', (done) => {
      const user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then((user) => user.getTimelines())
        .then((timelines) => {
          timelines.should.be.an.instanceOf(Array)
          timelines.length.should.be.eql(7)
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should return timelines', (done) => {
      const user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(() => user.getTimelines())
        .then((timelines) => {
          timelines.should.be.an.instanceOf(Array)
          timelines.should.not.be.empty
          timelines.length.should.be.eql(7)
          const timeline = timelines[0]
          timeline.should.have.property('name')
          timeline.name.should.eql('RiverOfNews')
          timelines[1].should.have.property('name')
          timelines[1].name.should.eql('Hides')
          timelines[2].should.have.property('name')
          timelines[2].name.should.eql('Comments')
          timelines[3].should.have.property('name')
          timelines[3].name.should.eql('Likes')
          timelines[4].should.have.property('name')
          timelines[4].name.should.eql('Posts')
          timelines[5].should.have.property('name')
          timelines[5].name.should.eql('Directs')
          timelines[6].should.have.property('name')
          timelines[6].name.should.eql('MyDiscussions')
          done()
        })
        .catch((e) => { done(e) })
    })
  })

  describe('#newPost()', () => {
    let user

    beforeEach((done) => {
      user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(() => { done() })
        .catch((e) => { done(e) })
    })

    it('should create a new post', (done) => {
      let post
      const attrs = { body: 'Post body' }

      user.newPost(attrs)
        .then((newPost) => {
          post = newPost
          return newPost.create()
        })
        .then((newPost) => dbAdapter.getPostById(newPost.id))
        .then((newPost) => {
          newPost.should.be.an.instanceOf(Post)
          newPost.should.not.be.empty
          newPost.should.have.property('id')
          newPost.id.should.eql(post.id)
          done();
        })
        .catch((e) => { done(e) })
    })

    it('should create a new post to a timeline', (done) => {
      let post
      const attrs = { body: 'Post body' }

      user.getPostsTimelineId()
        .then((timelineId) => {
          attrs.timelineIds = [timelineId]
          return user.newPost(attrs)
        })
        .then((newPost) => {
          post = newPost
          return newPost.create()
        })
        .then((newPost) => dbAdapter.getPostById(newPost.id))
        .then((newPost) => {
          newPost.should.be.an.instanceOf(Post)
          newPost.should.not.be.empty
          newPost.should.have.property('id')
          newPost.id.should.eql(post.id)

          return user.getPostsTimeline()
        })
        .then((timeline) => timeline.getPosts())
        .then((posts) => {
          posts.should.not.be.empty
          posts.length.should.eql(1)
          const newPost = posts[0]
          newPost.should.be.an.instanceOf(Post)
          newPost.should.not.be.empty
          newPost.should.have.property('body')
          newPost.body.should.eql(post.body)
          done()
        })
        .catch((e) => { done(e) })
    })
  })

  describe('#getPublicTimelineIds()', () => {
    it('should return all public timesline ids', (done) => {
      const user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then((user) => user.getPublicTimelineIds())
        .then((timelines) => {
          timelines.should.not.be.empty
          timelines.length.should.eql(3)
          done()
        })
        .catch((e) => { done(e) })
    })
  })

  describe('#subscribeTo()', () => {
    let userA
      , userB

    beforeEach(async () => {
      userA = new User({ username: 'Luna', password: 'password' })
      userB = new User({ username: 'Mars', password: 'password' })

      await Promise.all([userA.create(), userB.create()])
    })

    it('should subscribe to timeline', async () => {
      const attrs = { body: 'Post body' }
      const post = await userB.newPost(attrs)
      await post.create()
      const timelineId = await userB.getPostsTimelineId()
      await userA.subscribeTo(timelineId)
      const timeline = await userA.getRiverOfNewsTimeline()
      const posts = await timeline.getPosts()

      posts.should.not.be.empty
      posts.length.should.eql(1)
      const newPost = posts[0]
      newPost.should.have.property('body')
      newPost.body.should.eql(post.body)
      newPost.id.should.eql(post.id)
    })
  })

  describe('#subscribeToUsername()', () => {
    let userA
      , userB

    beforeEach(async () => {
      userA = new User({ username: 'Luna', password: 'password' })
      userB = new User({ username: 'Mars', password: 'password' })

      await Promise.all([userA.create(), userB.create()])
    })

    it('should subscribe to username', async () => {
      const attrs = { body: 'Post body' }
      const post = await userB.newPost(attrs)
      await post.create()
      await userA.subscribeToUsername(userB.username)
      const timeline = await userA.getRiverOfNewsTimeline()
      const posts = await timeline.getPosts()

      posts.should.not.be.empty
      posts.length.should.eql(1)

      const newPost = posts[0]
      newPost.should.have.property('body')
      newPost.body.should.eql(post.body)
      newPost.id.should.eql(post.id)
    });
  })

  describe('#unsubscribeFrom()', () => {
    let userA
      , userB

    beforeEach(async () => {
      userA = new User({ username: 'Luna', password: 'password' })
      userB = new User({ username: 'Mars', password: 'password' })

      await Promise.all([userA.create(), userB.create()])
    })

    it('should unsubscribe from timeline', (done) => {
      const attrs = { body: 'Post body' }
      let identifier

      userB.newPost(attrs)
        .then((newPost) => newPost.create())
        .then(() => userB.getPostsTimelineId())
        .then((timelineId) => {
          identifier = timelineId
          return userA.subscribeTo(timelineId)
        })
        .then(() => userA.unsubscribeFrom(identifier))
        .then(() => userA.getRiverOfNewsTimeline())
        .then((timeline) => timeline.getPosts())
        .then((posts) => {
          posts.should.be.empty
          done()
        })
        .catch((e) => { done(e) })
    })
  })

  describe('#getSubscriptions()', () => {
    let userA
      , userB

    beforeEach(async () => {
      userA = new User({ username: 'Luna', password: 'password' })
      userB = new User({ username: 'Mars', password: 'password' })

      await Promise.all([userA.create(), userB.create()])
    })

    it('should list subscriptions', async () => {
      const attrs = { body: 'Post body' };

      const newPost = await userB.newPost(attrs);
      await newPost.create();

      const timelineId = await userB.getPostsTimelineId();
      await userA.subscribeTo(timelineId);

      const feeds = await userA.getSubscriptions();
      feeds.should.not.be.empty;
      feeds.length.should.eql(3);

      const types = ['Comments', 'Likes', 'Posts'];

      for (const feed of feeds) {
        if (!types.includes(feed.name)) {
          throw new Error('got unexpected feed');
        }
      }
    })
  })
})
