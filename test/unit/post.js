/* eslint-env node, mocha */
/* global $pg_database, $should */
import knexCleaner from 'knex-cleaner'
import { dbAdapter, Post, User } from '../../app/models'


describe('Post', () => {
  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  describe('#update()', () => {
    let userA
      , post

    beforeEach(async () => {
      userA = new User({
        username: 'Luna',
        password: 'password'
      })
      await userA.create()

      const postAttrs = { body: 'Post body' }
      post = await userA.newPost(postAttrs)
      await post.create()
    })

    it('should update without error', (done) => {
      const body = 'Body'
      const attrs = { body }

      post.update(attrs)
        .then((newPost) => {
          newPost.should.be.an.instanceOf(Post)
          newPost.should.not.be.empty
          newPost.should.have.property('body')
          newPost.body.should.eql(post.body)
          done()
        })
        .catch((e) => { done(e) })
    })
  })

  describe('#create()', () => {
    let user,
      timelineId

    beforeEach(async () => {
      user = new User({
        username: 'Luna',
        password: 'password'
      })

      await user.create()
      timelineId = await user.getPostsTimelineId()
    })

    it('should create without error', (done) => {
      const post = new Post({
        body:             'Post body',
        userId:           user.id,
        timelineIds:      [timelineId],
        commentsDisabled: '0'
      })

      post.create()
        .then((post) => {
          post.should.be.an.instanceOf(Post)
          post.should.not.be.empty
          post.should.have.property('id')
          post.should.have.property('body')
          post.should.have.property('commentsDisabled')

          return dbAdapter.getPostById(post.id)
        })
        .then((newPost) => {
          newPost.should.be.an.instanceOf(Post)
          newPost.should.not.be.empty
          newPost.should.have.property('id')
          newPost.id.should.eql(post.id)
          newPost.should.have.property('body')
          newPost.body.should.eql('Post body')
          newPost.should.have.property('commentsDisabled')
          newPost.commentsDisabled.should.eql('0')
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should ignore whitespaces in body', (done) => {
      const body = '   Post body    '
      const post = new Post({
        body,
        userId:           user.id,
        timelineIds:      [timelineId],
        commentsDisabled: '0'
      })

      post.create()
        .then((post) => dbAdapter.getPostById(post.id))
        .then((newPost) => {
          newPost.should.be.an.instanceOf(Post)
          newPost.should.not.be.empty
          newPost.should.have.property('id')
          newPost.id.should.eql(post.id)
          newPost.body.should.eql(body.trim())
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should save valid post to users timeline', (done) => {
      const post = new Post({
        body:             'Post',
        userId:           user.id,
        timelineIds:      [timelineId],
        commentsDisabled: '0'
      })

      post.create()
        .then((post) => post.getSubscribedTimelineIds())
        .then((timelines) => {
          timelines.should.not.be.empty
          timelines.length.should.eql(2)
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should return no posts from blank timeline', (done) => {
      user.getRiverOfNewsTimeline()
        .then((timeline) => timeline.getPosts())
        .then((posts) => {
          posts.should.be.empty
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should return valid post from users timeline', (done) => {
      const post = new Post({
        body:             'Post',
        userId:           user.id,
        timelineIds:      [timelineId],
        commentsDisabled: '0'
      })

      post.create()
        .then(() => user.getRiverOfNewsTimeline())
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

    it('should not create with empty body', (done) => {
      const post = new Post({
        body:             '',
        userId:           user.id,
        timelineIds:      [timelineId],
        commentsDisabled: '0'
      })

      post.create()
        .then(() => { done(new Error('FAIL')) })
        .catch((e) => {
          e.message.should.eql('Post text must not be empty')
          done()
        })
    })

    it('should not create with too-long body', (done) => {
      const post = new Post({
        body:             'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec a diam lectus. Sed sit amet ipsum mauris. Maecenas congue ligula ac quam viverra nec consectetur ante hendrerit. Donec et mollis dolor. Praesent et diam eget libero egestas mattis sit amet vitae augue. Nam tincidunt congue enim, ut porta lorem lacinia consectetur. Donec ut libero sed arcu vehicula ultricies a non tortor. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aenean ut gravida lorem. Ut turpis felis, pulvinar a semper sed, adipiscing id dolor. Pellentesque auctor nisi id magna consequat sagittis. Curabitur dapibus enim sit amet elit pharetra tincidunt feugiat nisl imperdiet. Ut convallis libero in urna ultrices accumsan. Donec sed odio eros. Donec viverra mi quis quam pulvinar at malesuada arcu rhoncus. Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. In rutrum accumsan ultricies. Mauris vitae nisi at sem facilisis semper ac in est. Vivamus fermentum semper porta. Nunc diam velit, adipiscing ut tristique vitae, sagittis vel odio. Maecenas convallis ullamcorper ultricies. Curabitur ornare, ligula semper consectetur sagittis, nisi diam iaculis velit, id fringilla sem nunc vel mi. Nam dictum, odio nec pretium volutpat, arcu ante placerat erat, non tristique elit urna et turpis. Quisque mi metus, ornare sit amet fermentum et, tincidunt et orci. Fusce eget orci a orci congue vestibulum. Ut dolor diam, elementum et vestibulum eu, porttitor vel elit. Curabitur venenatis pulvinar tellus gravida ornare.',
        userId:           user.id,
        timelineIds:      [timelineId],
        commentsDisabled: '0'
      })

      post.create()
        .then(() => { done(new Error('FAIL')) })
        .catch((e) => {
          e.message.should.eql('Maximum post-length is 1500 graphemes')
          done()
        })
    })

    it("should create with commentsDisabled='1'", (done) => {
      const post = new Post({
        body:             'Post body',
        userId:           user.id,
        timelineIds:      [timelineId],
        commentsDisabled: '1'
      })

      post.create()
        .then((post) => {
          post.should.be.an.instanceOf(Post)
          post.should.not.be.empty
          post.should.have.property('id')
          post.should.have.property('commentsDisabled')
          post.commentsDisabled.should.eql('1')

          return dbAdapter.getPostById(post.id)
        })
        .then((newPost) => {
          newPost.should.be.an.instanceOf(Post)
          newPost.should.not.be.empty
          newPost.should.have.property('id')
          newPost.id.should.eql(post.id)
          newPost.should.have.property('commentsDisabled')
          newPost.commentsDisabled.should.eql('1')
          done()
        })
        .catch((e) => { done(e) })
    })
  })

  describe('#findById()', () => {
    let user,
      timelineId

    beforeEach(async () => {
      user = new User({
        username: 'Luna',
        password: 'password'
      })

      await user.create()
      timelineId = await user.getPostsTimelineId()
    })

    it('should find post with a valid id', (done) => {
      const post = new Post({
        body:             'Post body',
        userId:           user.id,
        timelineIds:      [timelineId],
        commentsDisabled: '0'
      })

      post.create()
        .then((post) => dbAdapter.getPostById(post.id))
        .then((newPost) => {
          newPost.should.be.an.instanceOf(Post)
          newPost.should.not.be.empty
          newPost.should.have.property('id')
          newPost.id.should.eql(post.id)
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should not find post with an invalid id', (done) => {
      const identifier = 'post:identifier'

      dbAdapter.getPostById(identifier)
        .then((post) => {
          $should.not.exist(post)
          done()
        })
        .catch((e) => { done(e) })
    })
  })

  describe('#getTimelineIds()', () => {
    let userA
      , userB
      , post

    beforeEach(async () => {
      userA = new User({
        username: 'Luna',
        password: 'password'
      })

      userB = new User({
        username: 'Mars',
        password: 'password'
      })

      const promiseB = userB.create();
      const promiseA = userA.create();

      await promiseB;
      const attrs = { body: 'Post body' }
      post = await userB.newPost(attrs);
      await post.create();

      await promiseA;
      const timelineId = await userB.getPostsTimelineId();
      await userA.subscribeTo(timelineId)
    })

    it('should copy post to subscribed River of News', (done) => {
      post.getTimelineIds()
        .then((timelineIds) => {
          timelineIds.should.not.be.empty
          timelineIds.length.should.eql(3)
          done()
        })
        .catch((e) => { done(e) })
    })
  })

  describe('#setCommentsDisabled()', () => {
    let user
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

  describe('#addLike()', () => {
    let userA
      , userB
      , userC
      , users
      , post

    beforeEach(async () => {
      userA = new User({ username: 'Luna', password: 'password' })
      userB = new User({ username: 'Mars', password: 'password' })
      userC = new User({ username: 'Zeus', password: 'password' })

      await Promise.all([userA.create(), userB.create(), userC.create()]);

      post = await userB.newPost({ body: 'Post body' })
      await post.create()

      const bTimelineId = await userB.getPostsTimelineId()
      await userA.subscribeTo(bTimelineId)

      const aTimelineId = await userA.getPostsTimelineId()
      await userC.subscribeTo(aTimelineId)

      const promises = [];
      for (let i = 0; i < 10; i++) {
        const user = new User({ username: `lunokhod${i}`, password: 'password' })
        promises.push(user.create())
      }
      users = await Promise.all(promises)
    })

    it('should add like to friend of friend timelines', (done) => {
      post.addLike(userA)
        .then(() => userC.getRiverOfNewsTimeline())
        .then((timeline) => timeline.getPosts())
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

    it('should not add liked posts to friends posts timelines', async () => {
      const post2 = await userA.newPost({ body: 'Post body 2' })
      await post2.create()

      await post.addLike(userA)

      const postsFeedA = await userA.getPostsTimeline({ currentUser: userC.id })
      const postsA = postsFeedA.posts

      postsA.should.not.be.empty
      postsA.length.should.eql(1)

      const newPost = postsA[0]
      newPost.should.have.property('id')
      newPost.id.should.eql(post2.id)
    });

    it('should add user to likes', async () => {
      await post.addLike(userA)
      const users = await post.getLikes()

      users.should.not.be.empty
      users.length.should.eql(1)

      const user = users[0]
      user.should.have.property('id')
      user.id.should.eql(userA.id)
    })

    it('should be possible to get all likes', async () => {
      for (let i = 0; i < 10; i++) {
        await post.addLike(users[i]);  // eslint-disable-line babel/no-await-in-loop
      }

      post.maxLikes = 'all'
      post.currentUser = users[5].id

      const likes = await post.getLikes()
      likes.length.should.eql(10)
      likes[0].id.should.eql(users[5].id)
      likes[1].id.should.eql(users[9].id)
      likes[2].id.should.eql(users[8].id)
      likes[3].id.should.eql(users[7].id)
      // …
      likes[9].id.should.eql(users[0].id)
    })

    it('should be possible to get some likes (properly sorted)', async () => {
      for (let i = 0; i < 10; i++) {
        await post.addLike(users[i]);  // eslint-disable-line babel/no-await-in-loop
      }

      post.maxLikes = 3
      post.currentUser = users[5].id

      {
        const likes = await post.getLikes()
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
      for (i = 0; i < 2; i++) {
        await post.addLike(users[i]);  // eslint-disable-line babel/no-await-in-loop
      }

      {
        const likes = await post.getLikes()
        likes.length.should.eql(2)
        likes[0].id.should.eql(users[0].id)
        likes[1].id.should.eql(users[1].id)
      }

      // 3 likes -> 3 open
      await post.addLike(users[i++])

      {
        const likes = await post.getLikes()
        likes.length.should.eql(3)
        likes[0].id.should.eql(users[0].id)
        likes[1].id.should.eql(users[2].id)
        likes[2].id.should.eql(users[1].id)
      }

      // 4 likes -> 4 open
      await post.addLike(users[i++])

      {
        const likes = await post.getLikes()
        likes.length.should.eql(4)
        likes[0].id.should.eql(users[0].id)
        likes[1].id.should.eql(users[3].id)
        likes[2].id.should.eql(users[2].id)
        likes[3].id.should.eql(users[1].id)
      }

      // 5 likes -> 3 open + 2 omitted
      await post.addLike(users[i++])

      {
        const likes = await post.getLikes()
        likes.length.should.eql(3)
        likes[0].id.should.eql(users[0].id)
        likes[1].id.should.eql(users[4].id)
        likes[2].id.should.eql(users[3].id)
      }

      // 6 likes -> 3 open + 3 omitted
      await post.addLike(users[i++])

      {
        const likes = await post.getLikes()
        likes.length.should.eql(3)
        likes[0].id.should.eql(users[0].id)
        likes[1].id.should.eql(users[5].id)
        likes[2].id.should.eql(users[4].id)
      }
    })
  })

  describe('#removeLike()', () => {
    let userA
      , userB
      , userC
      , post

    beforeEach(async () => {
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

      await Promise.all([userA.create(), userB.create(), userC.create()]);

      const attrs = { body: 'Post body' }
      post = await userB.newPost(attrs)
      await post.create();

      const [timelineIdA, timelineIdB] = await Promise.all([
        userA.getPostsTimelineId(),
        userB.getPostsTimelineId()
      ]);

      await Promise.all([
        userA.subscribeTo(timelineIdB),
        userC.subscribeTo(timelineIdA)
      ]);
    })

    it('should remove like from friend of friend timelines', (done) => {
      post.addLike(userA)
        .then(() => post.removeLike(userA.id))
        .then(() => post.getLikes())
        .then((users) => {
          users.should.be.empty
          done()
        })
        .catch((e) => { done(e) })
    })

    it('should add user to likes', (done) => {
      post.addLike(userA)
        .then(() => post.getLikes())
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

  describe('#addComment()', () => {
    let userA
      , userB
      , userC
      , post

    beforeEach(async () => {
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

      await Promise.all([userA.create(), userB.create(), userC.create()]);

      const attrs = { body: 'Post body' }
      post = await userB.newPost(attrs)
      await post.create();

      const [timelineIdA, timelineIdB] = await Promise.all([
        userA.getPostsTimelineId(),
        userB.getPostsTimelineId()
      ]);

      await Promise.all([
        userA.subscribeTo(timelineIdB),
        userC.subscribeTo(timelineIdA)
      ]);
    })

    it('should add comment to friend of friend timelines', (done) => {
      const commentAttrs = {
        body:   'Comment body',
        postId: post.id
      }

      const comment = userA.newComment(commentAttrs)

      comment.create()
        .then(() => userC.getRiverOfNewsTimeline())
        .then((timeline) => timeline.getPosts())
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

  describe('#getComments()', () => {
    let userA
      , post
    const comments = []

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

      for (let i = 0; i < 10; i++) {
        const commentAttrs = {
          body:   'Comment body',
          postId: post.id
        }
        comments[i] = userA.newComment(commentAttrs)
        await comments[i].create()  // eslint-disable-line babel/no-await-in-loop
      }
    })

    it('should get all comments', async () => {
      post.maxComments = 'all'

      const fetchedComments = await post.getComments()
      fetchedComments.should.not.be.empty
      fetchedComments.length.should.eql(10)

      for (let i = 0; i < 10; i++) {
        fetchedComments[i].should.have.property('id')
        fetchedComments[i].id.should.eql(comments[i].id)
      }
    })

    it('should get first and last comments', async () => {
      post.maxComments = 4

      const fetchedComments = await post.getComments()
      fetchedComments.should.not.be.empty
      fetchedComments.length.should.eql(4)

      fetchedComments[0].id.should.eql(comments[0].id)
      fetchedComments[1].id.should.eql(comments[1].id)
      fetchedComments[2].id.should.eql(comments[2].id)
      fetchedComments[3].id.should.eql(comments[9].id)
    })
  })

  describe('#destroy()', () => {
    let user
      , timelineId

    beforeEach(async () => {
      user = new User({
        username: 'Luna',
        password: 'password'
      })

      await user.create()
      timelineId = await user.getPostsTimelineId();
    })

    it('should destroy without error', (done) => {
      let post = new Post({
        body:             'Post body',
        userId:           user.id,
        timelineIds:      [timelineId],
        commentsDisabled: '0'
      })

      post.create()
        .then((newPost) => {
          const commentAttrs = {
            body:   'Comment body',
            postId: post.id
          }

          post = newPost
          return user.newComment(commentAttrs)
        })
        .then((comment) => comment.create())
        .then(() => post.destroy())
        .then(() => dbAdapter.getPostById(post.id))
        .then((post) => {
          (post === null).should.be.true
          done()
        })
        .catch((e) => { done(e) })
    })
  })
})
