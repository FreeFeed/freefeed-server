import async from 'async'
import { expect } from 'chai'

import { dbAdapter, Post, Timeline, User } from "../../app/models"


describe('User', function() {
  beforeEach(function(done) {
    $database.flushdbAsync()
      .then(function() { done() })
  })

  describe('#validPassword()', function() {
    it('should validate valid password', function(done) {
      var user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function(user) { return user.validPassword('password') })
        .then(function(valid) {
          valid.should.eql(true)
        })
        .then(function() { done() })
    })

    it('should not validate invalid password', function(done) {
      var user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function(user) { return user.validPassword('drowssap') })
        .then(function(valid) {
          valid.should.eql(false)
        })
        .then(function() { done() })
    })
  })

  describe('#isValidUsername()', function() {
    var valid = [
      'luna', 'lun', '12345', 'hello1234',
      ' group', 'group ',  // automatically trims
      'aaaaaaaaaaaaaaaaaaaaaaaaa'  // 25 chars is ok
    ]

    var i = 1
    valid.forEach(function(username) {
      it(`should allow username '${username}'`, function(done) {

        var user = new User({
          username: username,
          screenName: 'test',
          password: 'password',
          email: `user+${i++}@example.com`
        })

        user.create()
          .then(function() { done() })
      })
    })

    var invalid = [
      'lu', '-12345', 'luna-', 'hel--lo', 'save-our-snobs', 'абизьян',
      'gr oup', '',
      'aaaaaaaaaaaaaaaaaaaaaaaaaa'  // 26 chars is 1 char too much
    ]
    invalid.forEach(function(username) {
      it('should not allow invalid username ' + username, async () => {

        var user = new User({
          username: username,
          screenName: 'test',
          password: 'password',
          email: 'user@example.com'
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

  describe('#isValidDescription()', function() {
    var valid = [
      '',
      "Earth's only natural satellite",
      "window.alert('Ha-ha-ha!')",
      ' natural', 'satellite ', // automatically trims
      '!'.repeat(1500) // 1500 characters is OK
    ]

    var i = 1
    valid.forEach(function(description) {
      it(`should allow description ${i++}`, async () => {

        var user = new User({
          username: `username${i}`,
          screenName: 'test',
          password: 'password',
          email: `user+${i++}@example.com`
        })

        await user.create()

        const updatedUser = await user.update({
          description: description
        })

        updatedUser.should.be.an.instanceOf(User)
        updatedUser.should.not.be.empty
        updatedUser.should.have.property('id')
        updatedUser.description.should.eql(description.trim())
      })
    })

    var invalid = [
      '!'.repeat(1501) // 1501 characters is NOT OK
    ]

    invalid.forEach(function(description) {
      it('should not allow too long description', async () => {

        var user = new User({
          username: `username`,
          screenName: 'test',
          password: 'password',
          email: 'user@example.com'
        })

        await user.create()

        try {
          await user.update({
            description: description
          })
        } catch (e) {
          e.message.should.eql('Description is too long')
          return
        }

        throw new Error('FAIL')
      })
    })
  })

  describe('#validEmail()', function() {
    // @todo Provide fixtures to validate various email formats
    it('should validate syntactically correct email', function(done) {
      var user = new User({
        username: 'Luna',
        password: 'password',
        email: 'user@example.com'
      })

      user.create()
        .then(function() { done() })
    })

    it('should validate without email', function(done) {
      var user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function() { done() })
    })

    it('should not validate syntactically incorrect email', function() {
      var user = new User({
        username: 'Luna',
        password: 'password',
        email: 'user2@.example..com'
      })

      return user.create()
        .catch(function(e) {
          expect(e.message).to.equal('Invalid email');
        })
    })

    it('should not allow 2 users with same email', async () => {
      var user1 = new User({
        username: 'Luna1',
        password: 'password',
        email: 'email@example.com'
      })

      var user2 = new User({
        username: 'Luna2',
        password: 'password',
        email: 'email@example.com'
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

  describe('#update()', function() {
    it('should update without error', function(done) {
      var screenName = 'Mars'
      var description = 'The fourth planet from the Sun and the second smallest planet in the Solar System, after Mercury.'

      var user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function(user) {
          return user.update({
            screenName: screenName,
            description: description
          })
        })
        .then(function(newUser) {
          newUser.should.be.an.instanceOf(User)
          newUser.should.not.be.empty
          newUser.should.have.property('id')
          newUser.screenName.should.eql(screenName)
          newUser.description.should.eql(description)
        })
        .then(function() { done() })
    })

    it('should update without email', function(done) {
      var user = new User({
        username: 'Luna',
        screenName: 'luna',
        password: 'password',
        email: 'test@example.com'
      })

      user.create()
        .then(function(user) {
          return user.update({
            email: null
          })
        })
        .then(function(newUser) {
          newUser.should.be.an.instanceOf(User)
          newUser.should.not.be.empty
          newUser.should.have.property('id')
          done()
        })
    })

    it('should update without screenName', function(done) {
      var screenName = 'Luna'
      var user = new User({
        username: 'Luna',
        screenName: screenName,
        password: 'password'
      })

      user.create()
        .then(function(user) {
          return user.update({
          })
        })
        .then(function(newUser) {
          newUser.should.be.an.instanceOf(User)
          newUser.should.not.be.empty
          newUser.should.have.property('id')
          newUser.screenName.should.eql(screenName)
        })
        .then(function() { done() })
    })

    it('should not update with blank screenName', function(done) {
      var user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function(user) {
          return user.update({
            screenName: ''
          })
        })
        .catch(function(e) {
          e.message.should.eql(`"" is not a valid display name. Names must be between 3 and 25 characters long.`)
          done()
        })
    })
  })

  describe('#create()', function() {
    it('should create without error', function(done) {
      var user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function(user) {
          user.should.be.an.instanceOf(User)
          user.should.not.be.empty
          user.should.have.property('id')

          return user
        })
        .then((user) => dbAdapter.getUserById(user.id))
        .then(function(newUser) {
          newUser.should.be.an.instanceOf(User)
          newUser.should.not.be.empty
          newUser.should.have.property('id')
          newUser.id.should.eql(user.id)
          newUser.should.have.property('type')
          newUser.type.should.eql('user')
        })
        .then(function() { done() })
    })

    it('should create with an email address', function(done) {
      var user = new User({
        username: 'Luna',
        email: 'luna@example.com',
        password: 'password'
      })

      user.create()
        .then(function(user) {
          user.should.be.an.instanceOf(User)
          user.should.not.be.empty
          user.should.have.property('id')

          return user
        })
        .then((user) => dbAdapter.getUserById(user.id))
        .then(function(newUser) {
          newUser.should.be.an.instanceOf(User)
          newUser.should.not.be.empty
          newUser.should.have.property('id')
          newUser.id.should.eql(user.id)
          newUser.should.have.property('type')
          newUser.type.should.eql('user')
          newUser.should.have.property('email')
          newUser.email.should.eql(user.email)
        })
        .then(function() { done() })
    })

    it('should ignore whitespaces in username', function(done) {
      var username = ' Luna  '
        , user = new User({
          username: username,
          password: 'password'
        })

      user.create()
        .then(function(user) {
          user.should.be.an.instanceOf(User)
          user.should.not.be.empty
          user.should.have.property('id')

          return user
        })
        .then(() => dbAdapter.getUserById(user.id))
        .then(function(newUser) {
          newUser.should.be.an.instanceOf(User)
          newUser.should.not.be.empty
          newUser.should.have.property('id')
          newUser.id.should.eql(user.id)
          newUser.username.should.eql(username.trim().toLowerCase())
        })
        .then(function() { done() })
    })

    it('should not create with empty password', function(done) {
      var user = new User({
        username: 'Luna',
        password: ''
      })

      user.create()
        .catch(function(e) {
          e.message.should.eql("Password cannot be blank")
          done()
        })
    })

    it('should not create two users with the same username', function(done) {
      var userA
        , userB

      userA = new User({
        username: 'Luna',
        password: 'password'
      })

      userB = new User({
        username: 'luna',
        password: 'password'
      })

      userA.create()
        .then(function(user) { return userB.create() })
        .catch(function(e) {
          e.message.should.eql("Already exists")
          done()
        })
    })

    it('should not create user from stop-list', async () => {
      var user = new User({
        username: 'Public',
        password: 'password'
      })

      try {
        await user.create()
      } catch (e) {
        e.message.should.eql("Invalid username")
        return
      }

      throw new Error(`FAIL ("Public" username is in a stop-list. should not be allowed)`)
    })
  })

  describe('#findByEmail()', function() {
    it('should find a user by email', function(done) {
      let asyncFunc = async function() {
        var user = new User({
          username: 'Luna',
          password: 'password',
          email: 'luna@example.com'
        })

        await user.create()
        await user.update({ email: user.email })

        var newUser = await dbAdapter.getUserByEmail(user.email)

        newUser.should.be.an.instanceOf(User)
        newUser.should.not.be.empty
        newUser.should.have.property('id')
        newUser.id.should.eql(user.id)
      }

      asyncFunc().then(() => {done()}).catch((e) => {done(e)})
    })

    it('should not find a user by invalid email', function(done) {
      var user = new User({
        username: 'Luna',
        password: 'password',
        email: 'luna@example.com'
      })

      user.create()
        .then(function(user) { return user.update({ email: user.email }) })
        .then(function(user) { return dbAdapter.getUserByEmail('noreply@example.com') })
        .then(function(e) {
          expect(e).to.be.a('null')
          done()
        })
    })
  })

  describe('#findByResetToken()', function() {
    it('should find a user by reset token', function(done) {
      var user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function(user) { return user.updateResetPasswordToken() })
        .then(function(token) { return dbAdapter.getUserByResetToken(token) })
        .then(function(newUser) {
          newUser.should.be.an.instanceOf(User)
          newUser.should.not.be.empty
          newUser.should.have.property('id')
          newUser.id.should.eql(user.id)
        })
        .then(function() { done() })
    })

    it('should not find a user by invalid reset token', function(done) {
      var user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function(user) { return user.updateResetPasswordToken() })
        .then(function(token) { return dbAdapter.getUserByResetToken('token') })
        .then(function(e) {
          expect(e).to.be.a('null')
          done()
        })
    })
  })

  describe('#findById()', function() {
    it('should not find user with an invalid id', function(done) {
      var identifier = "user:identifier"

      dbAdapter.getUserById(identifier)
        .then(function(user) {
          $should.not.exist(user)
          done()
        })
    })

    it('should find user with a valid id', function(done) {
      var user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function(user) { return user })
        .then(function(user) { return dbAdapter.getUserById(user.id) })
        .then(function(newUser) {
          newUser.should.be.an.instanceOf(User)
          newUser.should.not.be.empty
          newUser.should.have.property('id')
          newUser.id.should.eql(user.id)
        })
        .then(function() { done() })
    })
  })

  describe('#findByUsername()', function(done) {
    it('should find user with a valid username', function(done) {
      var user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function(user) { return dbAdapter.getUserByUsername(user.username) })
        .then(function(newUser) {
          newUser.should.be.an.instanceOf(User)
          newUser.should.not.be.empty
          newUser.should.have.property('username')
          newUser.username.should.eql(user.username.toLowerCase())
        })
        .then(function() { done() })
    })
  })

  describe('#getRiverOfNews()', function() {
    it('should get river of news', function(done) {
      var user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function(user) {
          return user.getRiverOfNewsTimeline()
        })
        .then(function(timeline) {
          timeline.should.be.an.instanceOf(Timeline)
          timeline.should.not.be.empty
          timeline.should.have.property('name')
          timeline.name.should.eql('RiverOfNews')
        })
        .then(function() { done() })
    })
  })

  describe('#getLikesTimeline()', function() {
    it('should get likes timeline', function(done) {
      var user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function(user) {
          return user.getLikesTimeline()
        })
        .then(function(timeline) {
          timeline.should.be.an.instanceOf(Timeline)
          timeline.should.not.be.empty
          timeline.should.have.property('name')
          timeline.name.should.eql('Likes')
        })
        .then(function() { done() })
    })
  })

  describe('#getPostsTimeline()', function() {
    it('should get posts timeline', function(done) {
      var user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function(user) {
          return user.getPostsTimeline()
        })
        .then(function(timeline) {
          timeline.should.be.an.instanceOf(Timeline)
          timeline.should.not.be.empty
          timeline.should.have.property('name')
          timeline.name.should.eql('Posts')
        })
        .then(function() { done() })
    })
  })

  describe('#getCommentsTimeline()', function() {
    it('should get comments timeline', function(done) {
      var user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function(user) {
          return user.getCommentsTimeline()
        })
        .then(function(timeline) {
          timeline.should.be.an.instanceOf(Timeline)
          timeline.should.not.be.empty
          timeline.should.have.property('name')
          timeline.name.should.eql('Comments')
        })
        .then(function() { done() })
    })
  })

  describe('#getMyDiscussionsTimeline()', function() {
    var user

    beforeEach(function(done) {
      user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function(user) { done() })
    })

    it('should get my discussions timeline', function(done) {
      user.getMyDiscussionsTimeline()
        .then(function(timeline) {
          timeline.should.be.an.instanceOf(Timeline)
          timeline.should.not.be.empty
          timeline.should.have.property('name')
          timeline.name.should.eql('MyDiscussions')
          timeline.should.have.property('id')
          timeline.id.should.eql(user.id)
        })
        .then(function() { done() })
    })

    it('should include post to my discussions timeline', function(done) {
      var post
      var attrs = {
        body: 'Post body'
      }
      user.newPost(attrs)
        .then(function(newPost) {
          post = newPost
          return newPost.create()
        })
        .then(function(post) { return post.addLike(user) })
        .then(function() { return user.getMyDiscussionsTimeline() })
        .then(function(timeline) {
          timeline.should.be.an.instanceOf(Timeline)
          timeline.should.not.be.empty
          timeline.should.have.property('name')
          timeline.name.should.eql('MyDiscussions')

          return timeline.getPosts()
        })
        .then(function(posts) {
          posts.should.not.be.empty
          posts.length.should.eql(1)
          var newPost = posts[0]
          newPost.should.have.property('id')
          newPost.id.should.eql(post.id)
          done()
        })
        .catch(function(e) { done(e) })
    })
  })

  describe('#getTimelines()', function() {
    it('should return user timelines after user creation', function(done) {
      var user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function(user) { return user.getTimelines() })
        .then(function(timelines) {
          timelines.should.be.an.instanceOf(Array)
          timelines.length.should.be.eql(7)
        })
        .then(function() { done() })
    })

    it('should return timelines', function(done) {
      var user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function(newUser) { return user.getRiverOfNewsTimeline() })
        .then(function(timeline) { return user.getRiverOfNewsTimeline() })
        .then(function(timeline) { return user.getCommentsTimeline() })
        .then(function(timeline) { return user.getCommentsTimeline() })
        .then(function(timeline) { return user.getLikesTimeline() })
        .then(function(timeline) { return user.getLikesTimeline() })
        .then(function(timeline) { return user.getPostsTimeline() })
        .then(function(timeline) { return user.getPostsTimeline() })
        .then(function(timeline) { return user.getTimelines() })
        .then(function(timelines) {
          timelines.should.be.an.instanceOf(Array)
          timelines.should.not.be.empty
          timelines.length.should.be.eql(7)
          var timeline = timelines[0]
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
        })
        .then(function() { done() })
    })
  })

  describe('#newPost()', function() {
    var user

    beforeEach(function(done) {
      user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function(user) { done() })
    })

    it('should create a new post', function(done) {
      var post
      var attrs = {
        body: 'Post body'
      }

      user.newPost(attrs)
        .then(function(newPost) {
          post = newPost
          return newPost.create()
        })
        .then(function(newPost) { return dbAdapter.getPostById(newPost.id) })
        .then(function(newPost) {
          newPost.should.be.an.instanceOf(Post)
          newPost.should.not.be.empty
          newPost.should.have.property('id')
          newPost.id.should.eql(post.id)
        })
        .then(function() { done() })
    })

    it('should create a new post to a timeline', function(done) {
      var post
      var attrs = {
        body: 'Post body'
      }

      user.getPostsTimelineId()
        .then(function(timelineId) {
          attrs.timelineIds = [timelineId]
          return user.newPost(attrs)
        })
        .then(function(newPost) {
          post = newPost
          return newPost.create()
        })
        .then(function(newPost) { return dbAdapter.getPostById(newPost.id) })
        .then(function(newPost) {
          newPost.should.be.an.instanceOf(Post)
          newPost.should.not.be.empty
          newPost.should.have.property('id')
          newPost.id.should.eql(post.id)

          return user.getPostsTimeline()
        })
        .then(function(timeline) { return timeline.getPosts() })
        .then(function(posts) {
          posts.should.not.be.empty
          posts.length.should.eql(1)
          var newPost = posts[0]
          newPost.should.be.an.instanceOf(Post)
          newPost.should.not.be.empty
          newPost.should.have.property('body')
          newPost.body.should.eql(post.body)
        })
        .then(function() { done() })
    })
  })

  describe('#getPublicTimelineIds()', function() {
    it('should return all public timesline ids', function(done) {
      var user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function(user) { return user.getPublicTimelineIds() })
        .then(function(timelines) {
          timelines.should.not.be.empty
          timelines.length.should.eql(3)
        })
        .then(function(user) { done() })
    })
  })

  describe('#subscribeTo()', function() {
    var userA
      , userB

    beforeEach(function(done) {
      userA = new User({
        username: 'Luna',
        password: 'password'
      })

      userB = new User({
        username: 'Mars',
        password: 'password'
      })

      userA.create()
        .then(function(user) { return userB.create() })
        .then(function(user) { done() })
    })

    it('should subscribe to timeline', async function() {
      var attrs = {
        body: 'Post body'
      }
      var post = await userB.newPost(attrs)
      await post.create()
      let timelineId = await userB.getPostsTimelineId()
      await userA.subscribeTo(timelineId)
      let timeline = await userA.getRiverOfNewsTimeline()
      let posts = await timeline.getPosts()

      posts.should.not.be.empty
      posts.length.should.eql(1)
      var newPost = posts[0]
      newPost.should.have.property('body')
      newPost.body.should.eql(post.body)
      newPost.id.should.eql(post.id)
    })
  })

  describe('#subscribeToUsername()', function() {
    var userA
      , userB

    beforeEach(function(done) {
      userA = new User({
        username: 'Luna',
        password: 'password'
      })

      userB = new User({
        username: 'Mars',
        password: 'password'
      })

      userA.create()
        .then(function(user) { return userB.create() })
        .then(function(user) { done() })
    })

    it('should subscribe to username', async function(done) {
      var attrs = {
        body: 'Post body'
      }
      var post = await userB.newPost(attrs)
      await post.create()
      await userA.subscribeToUsername(userB.username)
      let timeline = await userA.getRiverOfNewsTimeline()
      let posts = await timeline.getPosts()

      posts.should.not.be.empty
      posts.length.should.eql(1)
      var newPost = posts[0]
      newPost.should.have.property('body')
      newPost.body.should.eql(post.body)
      newPost.id.should.eql(post.id)

      done()
    })
  })

  describe('#unsubscribeFrom()', function() {
    var userA
      , userB

    beforeEach(function(done) {
      userA = new User({
        username: 'Luna',
        password: 'password'
      })

      userB = new User({
        username: 'Mars',
        password: 'password'
      })

      userA.create()
        .then(function(user) { return userB.create() })
        .then(function(user) { done() })
    })

    it('should unsubscribe from timeline', function(done) {
      var attrs = {
        body: 'Post body'
      }
      var identifier

      userB.newPost(attrs)
        .then(function(newPost) { return newPost.create() })
        .then(function(post) { return userB.getPostsTimelineId() })
        .then(function(timelineId) {
          identifier = timelineId
          return userA.subscribeTo(timelineId)
        })
        .then(function(timelineId) { return userA.unsubscribeFrom(identifier) })
        .then(function() { return userA.getRiverOfNewsTimeline() })
        .then(function(timeline) { return timeline.getPosts() })
        .then(function(posts) {
          posts.should.be.empty
        })
        .then(function() { done() })
    })
  })

  describe('#getSubscriptions()', function() {
    var userA
      , userB

    beforeEach(function(done) {
      userA = new User({
        username: 'Luna',
        password: 'password'
      })

      userB = new User({
        username: 'Mars',
        password: 'password'
      })

      userA.create()
        .then(function(user) { return userB.create() })
        .then(function(user) { done() })
    })

    it('should list subscriptions', function(done) {
      var attrs = {
        body: 'Post body'
      }
      var post

      userB.newPost(attrs)
        .then(function(newPost) {
          post = newPost
          return newPost.create()
        })
        .then(function(post) { return userB.getPostsTimelineId() })
        .then(function(timelineId) { return userA.subscribeTo(timelineId) })
        .then(function() { return userA.getSubscriptions() })
        .then(function(users) {
          users.should.not.be.empty
          users.length.should.eql(3)
          var types = ['Comments', 'Likes', 'Posts']
          async.reduce(users, true, function(memo, user, callback) {
            callback(null, memo && (types.indexOf(user.name) >= 0))
          }, function(err, contains) {
            contains.should.eql(true)
            done()
          })
        })
    })
  })
})
