import { dbAdapter, Comment, Post, User } from "../../app/models"


describe('Post', function() {
  beforeEach(function(done) {
    $database.flushdbAsync()
      .then(function() { done() })
  })

  describe('#update()', function() {
    var userA
      , post

    beforeEach(function(done) {
      userA = new User({
        username: 'Luna',
        password: 'password'
      })

      var postAttrs = { body: 'Post body' }

      userA.create()
        .then(function(user) { return userA.newPost(postAttrs) })
        .then(function(newPost) { return newPost.create() })
        .then(function(newPost) {
          post = newPost
          done()
        })
    })

    it('should update without error', function(done) {
      var body = 'Body'
      var attrs = {
        body: body
      }

      post.update(attrs)
        .then(function(newPost) {
          newPost.should.be.an.instanceOf(Post)
          newPost.should.not.be.empty
          newPost.should.have.property('body')
          newPost.body.should.eql(post.body)
        })
        .then(function() { done() })
    })
  })

  describe('#create()', function() {
    var user,
      timelineId

    beforeEach(function(done) {
      user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function(user) {
          return user.getPostsTimelineId()
        })
        .then(function(postsTimelineId) {
          timelineId = postsTimelineId
          done()
        })
    })

    it('should create without error', function(done) {
      var post = new Post({
        body: 'Post body',
        userId: user.id,
        timelineIds: [timelineId],
        commentsDisabled: '0'
      })

      post.create()
        .then(function(post) {
          post.should.be.an.instanceOf(Post)
          post.should.not.be.empty
          post.should.have.property('id')
          post.should.have.property('body')
          post.should.have.property('commentsDisabled')

          return post
        })
        .then(function(post) { return dbAdapter.getPostById(post.id) })
        .then(function(newPost) {
          newPost.should.be.an.instanceOf(Post)
          newPost.should.not.be.empty
          newPost.should.have.property('id')
          newPost.id.should.eql(post.id)
          newPost.should.have.property('body')
          newPost.body.should.eql('Post body')
          newPost.should.have.property('commentsDisabled')
          newPost.commentsDisabled.should.eql('0')
        })
        .then(function() { done() })
    })

    it('should ignore whitespaces in body', function(done) {
      var body = '   Post body    '
      var post = new Post({
        body: body,
        userId: user.id,
        timelineIds: [timelineId],
        commentsDisabled: '0'
      })

      post.create()
        .then(function(post) { return dbAdapter.getPostById(post.id) })
        .then(function(newPost) {
          newPost.should.be.an.instanceOf(Post)
          newPost.should.not.be.empty
          newPost.should.have.property('id')
          newPost.id.should.eql(post.id)
          newPost.body.should.eql(body.trim())
        })
        .then(function() { done() })
    })

    it('should save valid post to users timeline', function(done) {
      var post = new Post({
        body: 'Post',
        userId: user.id,
        timelineIds: [timelineId],
        commentsDisabled: '0'
      })

      post.create()
        .then(function(post) { return post.getSubscribedTimelineIds() })
        .then(function(timelines) {
          timelines.should.not.be.empty
          timelines.length.should.eql(2)
        })
        .then(function() { done() })
    })

    it('should return no posts from blank timeline', function(done) {
      user.getRiverOfNewsTimeline()
        .then(function(timeline) { return timeline.getPosts() })
        .then(function(posts) {
          posts.should.be.empty
        })
        .then(function() { done() })
    })

    it('should return valid post from users timeline', function(done) {
      var post = new Post({
        body: 'Post',
        userId: user.id,
        timelineIds: [timelineId],
        commentsDisabled: '0'
      })

      post.create()
        .then(function(post) { return user.getRiverOfNewsTimeline() })
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

    it('should not create with empty body', function(done) {
      var post = new Post({
        body: '',
        userId: user.id,
        timelineIds: [timelineId],
        commentsDisabled: '0'
      })

      post.create()
        .catch(function(e) {
          e.message.should.eql("Invalid")
          done()
        })
    })

    it('should not create with too-long body', function(done) {
      var post = new Post({
        body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec a diam lectus. Sed sit amet ipsum mauris. Maecenas congue ligula ac quam viverra nec consectetur ante hendrerit. Donec et mollis dolor. Praesent et diam eget libero egestas mattis sit amet vitae augue. Nam tincidunt congue enim, ut porta lorem lacinia consectetur. Donec ut libero sed arcu vehicula ultricies a non tortor. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aenean ut gravida lorem. Ut turpis felis, pulvinar a semper sed, adipiscing id dolor. Pellentesque auctor nisi id magna consequat sagittis. Curabitur dapibus enim sit amet elit pharetra tincidunt feugiat nisl imperdiet. Ut convallis libero in urna ultrices accumsan. Donec sed odio eros. Donec viverra mi quis quam pulvinar at malesuada arcu rhoncus. Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. In rutrum accumsan ultricies. Mauris vitae nisi at sem facilisis semper ac in est. Vivamus fermentum semper porta. Nunc diam velit, adipiscing ut tristique vitae, sagittis vel odio. Maecenas convallis ullamcorper ultricies. Curabitur ornare, ligula semper consectetur sagittis, nisi diam iaculis velit, id fringilla sem nunc vel mi. Nam dictum, odio nec pretium volutpat, arcu ante placerat erat, non tristique elit urna et turpis. Quisque mi metus, ornare sit amet fermentum et, tincidunt et orci. Fusce eget orci a orci congue vestibulum. Ut dolor diam, elementum et vestibulum eu, porttitor vel elit. Curabitur venenatis pulvinar tellus gravida ornare.',
        userId: user.id,
        timelineIds: [timelineId],
        commentsDisabled: '0'
      })

      post.create()
        .then(function() { done(new Error("FAIL")) })
        .catch(function(e) {
          e.message.should.eql("Maximum post-length is 1500 graphemes")
          done()
        })
    })

    it("should create with commentsDisabled='1'", function(done) {
      var post = new Post({
        body: 'Post body',
        userId: user.id,
        timelineIds: [timelineId],
        commentsDisabled: '1'
      })

      post.create()
        .then(function(post) {
          post.should.be.an.instanceOf(Post)
          post.should.not.be.empty
          post.should.have.property('id')
          post.should.have.property('commentsDisabled')
          post.commentsDisabled.should.eql('1')
          return post
        })
        .then(function(post) {
          return dbAdapter.getPostById(post.id)
        })
        .then(function(newPost) {
          newPost.should.be.an.instanceOf(Post)
          newPost.should.not.be.empty
          newPost.should.have.property('id')
          newPost.id.should.eql(post.id)
          newPost.should.have.property('commentsDisabled')
          newPost.commentsDisabled.should.eql('1')
        })
        .then(function() {
          done()
        })
    })
  })

  describe('#findById()', function() {
    var user,
      timelineId

    beforeEach(function(done) {
      user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function() {
          return user.getPostsTimelineId()
        })
        .then(function(postsTimelineId) {
          timelineId = postsTimelineId
          done()
        })
    })

    it('should find post with a valid id', function(done) {
      var post = new Post({
        body: 'Post body',
        userId: user.id,
        timelineIds: [timelineId],
        commentsDisabled: '0'
      })

      post.create()
        .then(function(post) { return dbAdapter.getPostById(post.id) })
        .then(function(newPost) {
          newPost.should.be.an.instanceOf(Post)
          newPost.should.not.be.empty
          newPost.should.have.property('id')
          newPost.id.should.eql(post.id)
        })
        .then(function() { done() })
    })

    it('should not find post with an invalid id', function(done) {
      var identifier = "post:identifier"

      dbAdapter.getPostById(identifier)
        .then(function(post) {
          $should.not.exist(post)
        })
        .then(function() { done() })
    })
  })

  describe('#getTimelineIds()', function() {
    var userA
      , userB
      , post

    beforeEach(function(done) {
      userA = new User({
        username: 'Luna',
        password: 'password'
      })

      userB = new User({
        username: 'Mars',
        password: 'password'
      })

      var attrs = {
        body: 'Post body'
      }

      userA.create()
        .then(function(user) { return userB.create() })
        .then(function(user) { return userB.newPost(attrs) })
        .then(function(newPost) { return newPost.create() })
        .then(function(newPost) {
          post = newPost
          return userB.getPostsTimelineId()
        })
        .then(function(timelineId) { return userA.subscribeTo(timelineId) })
        .then(function(res) { done() })
    })

    it('should copy post to subscribed River of News', function(done) {
      post.getTimelineIds()
        .then(function(timelineIds) {
          timelineIds.should.not.be.empty
          timelineIds.length.should.eql(3)
        })
        .then(function() { done() })
    })
  })

  describe('#setCommentsDisabled()', function() {
    var user
      , post

    beforeEach(async () => {
      user = new User({ username: 'Luna', password: 'password' })
      await user.create()
      post = await user.newPost({ body: 'Post body', commentsDisabled: '0' })
      await post.create()
    })

    it('should set commentsDisabled', async () => {
      post.commentsDisabled.should.eql('0')
      await post.setCommentsDisabled('1')
      post.commentsDisabled.should.eql('1')
    })
  })

  describe('#addLike()', function() {
    var userA
      , userB
      , userC
      , users
      , post

    beforeEach(async () => {
      userA = new User({ username: 'Luna', password: 'password' })
      userB = new User({ username: 'Mars', password: 'password' })
      userC = new User({ username: 'Zeus', password: 'password' })

      await userA.create()
      await userB.create()
      await userC.create()

      post = await userB.newPost({ body: 'Post body' })
      await post.create()

      let bTimelineId = await userB.getPostsTimelineId()
      await userA.subscribeTo(bTimelineId)

      let aTimelineId = await userA.getPostsTimelineId()
      await userC.subscribeTo(aTimelineId)

      let promises = [];
      for (let i=0; i<10; i++) {
        let user = new User({ username: `lunokhod${i}`, password: 'password' })
        promises.push(user.create())
      }
      users = await Promise.all(promises)
    })

    it('should add like to friend of friend timelines', function(done) {
      post.addLike(userA)
        .then(function(res) { return userC.getRiverOfNewsTimeline() })
        .then(function(timeline) { return timeline.getPosts() })
        .then(function(posts) {
          posts.should.not.be.empty
          posts.length.should.eql(1)
          var newPost = posts[0]
          newPost.should.have.property('id')
          newPost.id.should.eql(post.id)
        })
        .then(function() { done() })
        .catch(function(e) { done(e) })
    })

    it('should add user to likes', async () => {
      await post.addLike(userA)
      let users = await post.getLikes()

      users.should.not.be.empty
      users.length.should.eql(1)

      var user = users[0]
      user.should.have.property('id')
      user.id.should.eql(userA.id)
    })

    it('should be possible to get all likes', async () => {
      for (let i=0; i<10; i++) {
        await post.addLike(users[i])
      }

      post.maxLikes = 'all'
      post.currentUser = users[5].id

      let likes = await post.getLikes()
      likes.length.should.eql(10)
      likes[0].id.should.eql(users[5].id)
      likes[1].id.should.eql(users[9].id)
      likes[2].id.should.eql(users[8].id)
      likes[3].id.should.eql(users[7].id)
      // …
      likes[9].id.should.eql(users[0].id)

    })

    it('should be possible to get some likes (properly sorted)', async () => {
      for (let i=0; i<10; i++) {
        await post.addLike(users[i])
      }

      post.maxLikes = 3
      post.currentUser = users[5].id

      {
        let likes = await post.getLikes()
        likes.length.should.eql(3)
        likes[0].id.should.eql(users[5].id)
        likes[1].id.should.eql(users[9].id)
        likes[2].id.should.eql(users[8].id)
      }
    })

    it('should be possible to get some likes (properly omitted on the threshold)', async () => {
      let i

      post.maxLikes = 3
      post.currentUser = users[0].id

      // 2 likes -> 2 open
      for (i=0; i<2; i++) {
        await post.addLike(users[i])
      }

      {
        let likes = await post.getLikes()
        likes.length.should.eql(2)
        likes[0].id.should.eql(users[0].id)
        likes[1].id.should.eql(users[1].id)
      }

      // 3 likes -> 3 open
      await post.addLike(users[i++])

      {
        let likes = await post.getLikes()
        likes.length.should.eql(3)
        likes[0].id.should.eql(users[0].id)
        likes[1].id.should.eql(users[2].id)
        likes[2].id.should.eql(users[1].id)
      }

      // 4 likes -> 4 open
      await post.addLike(users[i++])

      {
        let likes = await post.getLikes()
        likes.length.should.eql(4)
        likes[0].id.should.eql(users[0].id)
        likes[1].id.should.eql(users[3].id)
        likes[2].id.should.eql(users[2].id)
        likes[3].id.should.eql(users[1].id)
      }

      // 5 likes -> 3 open + 2 omitted
      await post.addLike(users[i++])

      {
        let likes = await post.getLikes()
        likes.length.should.eql(3)
        likes[0].id.should.eql(users[0].id)
        likes[1].id.should.eql(users[4].id)
        likes[2].id.should.eql(users[3].id)
      }

      // 6 likes -> 3 open + 3 omitted
      await post.addLike(users[i++])

      {
        let likes = await post.getLikes()
        likes.length.should.eql(3)
        likes[0].id.should.eql(users[0].id)
        likes[1].id.should.eql(users[5].id)
        likes[2].id.should.eql(users[4].id)
      }
    })
  })

  describe('#removeLike()', function() {
    var userA
      , userB
      , userC
      , post

    beforeEach(function(done) {
      userA = new User({
        username: 'Luna',
        password: 'password'
      })

      userB = new User({
        username: 'Mars',
        password: 'password'
      })

      userC = new User({
        username: 'Zeus',
        password: 'password'
      })

      var attrs = {
        body: 'Post body'
      }

      userA.create()
        .then(function(user) { return userC.create() })
        .then(function(user) { return userB.create() })
        .then(function(user) { return userB.newPost(attrs) })
        .then(function(newPost) { return newPost.create() })
        .then(function(newPost) {
          post = newPost
          return userB.getPostsTimelineId()
        })
        .then(function(timelineId) { return userA.subscribeTo(timelineId) })
        .then(function(res) { return userA.getPostsTimelineId() })
        .then(function(timelineId) { return userC.subscribeTo(timelineId) })
        .then(function(res) { done() })
    })

    it('should remove like from friend of friend timelines', function(done) {
      post.addLike(userA)
        .then(function(res) { return post.removeLike(userA.id) })
        .then(function(res) { return post.getLikes() })
        .then(function(users) {
          users.should.be.empty
        })
        .then(function() { done() })
        .catch(function(e) { done(e) })
    })

    it('should add user to likes', function(done) {
      post.addLike(userA)
        .then(function(res) { return post.getLikes() })
        .then(function(users) {
          users.should.not.be.empty
          users.length.should.eql(1)
          var user = users[0]
          user.should.have.property('id')
          user.id.should.eql(userA.id)
        })
        .then(function() { done() })
        .catch(function(e) { done(e) })
    })
  })

  describe('#addComment()', function() {
    var userA
      , userB
      , userC
      , post

    beforeEach(function(done) {
      userA = new User({
        username: 'Luna',
        password: 'password'
      })

      userB = new User({
        username: 'Mars',
        password: 'password'
      })

      userC = new User({
        username: 'Zeus',
        password: 'password'
      })

      var postAttrs = { body: 'Post body' }

      userA.create()
        .then(function(user) { return userC.create() })
        .then(function(user) { return userB.create() })
        .then(function(user) { return userB.newPost(postAttrs) })
        .then(function(newPost) { return newPost.create() })
        .then(function(newPost) {
          post = newPost
          return userB.getPostsTimelineId()
        })
        .then(function(timelineId) { return userA.subscribeTo(timelineId) })
        .then(function(res) { return userA.getPostsTimelineId() })
        .then(function(timelineId) { return userC.subscribeTo(timelineId) })
        .then(function(res) { done() })
    })

    it('should add comment to friend of friend timelines', function(done) {
      var commentAttrs = {
        body: 'Comment body',
        postId: post.id
      }

      let comment = userA.newComment(commentAttrs)

      comment.create()
        .then(function(res) { return userC.getRiverOfNewsTimeline() })
        .then(function(timeline) { return timeline.getPosts() })
        .then(function(posts) {
          posts.should.not.be.empty
          posts.length.should.eql(1)
          var newPost = posts[0]
          newPost.should.have.property('id')
          newPost.id.should.eql(post.id)
        })
        .then(function() { done() })
    })
  })

  describe('#getComments()', function() {
    let userA
      , post
      , comments = []

    beforeEach(async () => {
      const userAttrs = {
        username: 'Luna',
        password: 'password'
      }
      userA = new User(userAttrs)
      await userA.create()

      const postAttrs = { body: 'Post body' }
      post = await userA.newPost(postAttrs)
      await post.create()

      for (let i=0; i<10; i++) {
        const commentAttrs = {
          body: 'Comment body',
          postId: post.id
        }
        comments[i] = await userA.newComment(commentAttrs)
        await comments[i].create()
      }
    })

    it('should get all comments', async () => {
      post.maxComments = 'all'

      let fetchedComments = await post.getComments()
      fetchedComments.should.not.be.empty
      fetchedComments.length.should.eql(10)

      for (let i=0; i<10; i++) {
        fetchedComments[i].should.have.property('id')
        fetchedComments[i].id.should.eql(comments[i].id)
      }
    })

    it('should get first and last comments', async () => {
      post.maxComments = 4

      let fetchedComments = await post.getComments()
      fetchedComments.should.not.be.empty
      fetchedComments.length.should.eql(4)

      fetchedComments[0].id.should.eql(comments[0].id)
      fetchedComments[1].id.should.eql(comments[1].id)
      fetchedComments[2].id.should.eql(comments[2].id)
      fetchedComments[3].id.should.eql(comments[9].id)
    })
  })

  describe('#destroy()', function() {
    var user
      , timelineId

    beforeEach(function(done) {
      user = new User({
        username: 'Luna',
        password: 'password'
      })

      user.create()
        .then(function() {
          return user.getPostsTimelineId()
        })
        .then(function(postsTimelineId) {
          timelineId = postsTimelineId
          done()
        })
    })

    it('should create without error', function(done) {
      var post = new Post({
        body: 'Post body',
        userId: user.id ,
        timelineIds: [timelineId],
        commentsDisabled: '0'
      })

      post.create()
        .then(function(newPost) {
          var commentAttrs = {
            body: 'Comment body',
            postId: post.id
          }

          post = newPost
          return user.newComment(commentAttrs)
        })
        .then(function(comment) { return comment.create() })
        .then(function() { return post.destroy() })
        .then(function() { return dbAdapter.getPostById(post.id) })
        .then(function(post) {
          (post === null).should.be.true
          done()
        })
    })
  })
})
