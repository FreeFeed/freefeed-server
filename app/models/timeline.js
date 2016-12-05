import _ from 'lodash'

import { PubSub as pubSub } from '../models'


export function addModel(dbAdapter) {
  /**
   * @constructor
   */
  const Timeline = function (params) {
    this.id = params.id
    this.intId = params.intId
    this.name = params.name
    this.userId = params.userId
    this.user = null;
    if (parseInt(params.createdAt, 10))
      this.createdAt = params.createdAt
    if (parseInt(params.updatedAt, 10))
      this.updatedAt = params.updatedAt
    this.offset = parseInt(params.offset, 10) || 0
    this.limit = parseInt(params.limit, 10) || 30
    this.currentUser = params.currentUser
  }

  Timeline.className = Timeline
  Timeline.namespace = 'timeline'

  Reflect.defineProperty(Timeline.prototype, 'name', {
    get: function () { return this.name_ },
    set: function (newValue) {
      newValue ? this.name_ = newValue.trim() : this.name_ = ''
    }
  })

  /**
   * Adds the specified post to all timelines where it needs to appear
   * (the timelines of the feeds to which it is posted, the River of News
   * timeline of the posting user and the River of News timelines of all
   * subscribers of the feeds to which it is posted).
   */

  Timeline.publishPost = async function (post) {
    const currentTime = new Date().getTime()

    // We can use post.timelineIds here instead of post.getPostedToIds
    // because we are about to create that post and have just received
    // a request from user, so postedToIds == timelineIds here
    const timelines = await dbAdapter.getTimelinesByIds(post.timelineIds)

    const promises = timelines.map(async (timeline) => {
      const feed = await timeline.getUser()
      await feed.updateLastActivityAt()

      if (timeline.isDirects()) {
        await pubSub.updateUnreadDirects(timeline.userId)
      }

      return timeline.getSubscribersRiversOfNewsIntIds()
    })

    const allSubscribedTimelineIds = _.flatten(await Promise.all(promises))
    const allTimelines = _.uniq(_.union(post.feedIntIds, allSubscribedTimelineIds))
    await dbAdapter.setPostUpdatedAt(post.id, currentTime)
    await dbAdapter.insertPostIntoFeeds(allTimelines, post.id)
    await pubSub.newPost(post.id)
  }

  Timeline.getObjectsByIds = async function (objectIds) {
    return dbAdapter.getTimelinesByIds(objectIds)
  }

  Timeline.prototype.validate = async function () {
    const valid = this.name
      && this.name.length > 0
      && this.userId
      && this.userId.length > 0

    if (!valid)
      throw new Error('Invalid')
  }

  Timeline.prototype.create = async function () {
    return this._createTimeline()
  }

  Timeline.prototype._createTimeline = async function () {
    const currentTime = new Date().getTime()

    await this.validate()

    const payload = {
      'name':      this.name,
      'userId':    this.userId,
      'createdAt': currentTime.toString(),
      'updatedAt': currentTime.toString()
    }

    const ids = await dbAdapter.createTimeline(payload);
    this.id = ids.id;
    this.intId = ids.intId;

    this.createdAt = currentTime
    this.updatedAt = currentTime

    return this
  }

  Timeline.prototype.getPostIds = async function (offset, limit) {
    if (_.isUndefined(offset))
      offset = this.offset
    else if (offset < 0)
      offset = 0

    // -1 = special magic number, meaning “do not use limit defaults,
    // do not use passed in value, use 0 instead". this is at the very least
    // used in Timeline.mergeTo()
    if (_.isUndefined(limit))
      limit = this.limit
    else if (limit < 0)
      limit = 0

    const valid = await this.canShow(this.currentUser)

    if (!valid)
      return []

    this.postIds = await dbAdapter.getTimelinePostsRange(this.intId, offset, limit)
    return this.postIds
  }

  Timeline.prototype.getFeedPosts = async function (offset, limit, params, customFeedIds) {
    const valid = await this.canShow(this.currentUser)

    if (!valid)
      return []

    let feedIds = [this.intId]
    if (customFeedIds) {
      feedIds = customFeedIds
    }

    return dbAdapter.getFeedsPostsRange(feedIds, offset, limit, params)
  }

  Timeline.prototype.getPosts = async function (offset, limit) {
    if (_.isUndefined(offset))
      offset = this.offset
    else if (offset < 0)
      offset = 0

    // -1 = special magic number, meaning “do not use limit defaults,
    // do not use passed in value, use 0 instead". this is at the very least
    // used in Timeline.mergeTo()
    if (_.isUndefined(limit))
      limit = this.limit
    else if (limit < 0)
      limit = 0

    const reader = this.currentUser ? (await dbAdapter.getUserById(this.currentUser)) : null
    const banIds = reader ? (await reader.getBanIds()) : []
    const readerOwnFeeds = reader ? (await reader.getPublicTimelinesIntIds()) : []
    const feedOwner = await this.getUser()

    let posts
    if (this.name != 'MyDiscussions') {
      posts = await this.getFeedPosts(0, offset + limit, { currentUser: this.currentUser })
    } else {
      const myDiscussionsFeedSourcesIds = await Promise.all([feedOwner.getCommentsTimelineIntId(), feedOwner.getLikesTimelineIntId()])
      posts = await this.getFeedPosts(0, offset + limit, { currentUser: this.currentUser }, myDiscussionsFeedSourcesIds)
    }
    const postIds = posts.map((p) => {
      return p.id
    })

    if (reader && this.name == 'RiverOfNews') {
      let oldestPostTime
      if (posts[posts.length - 1]) {
        oldestPostTime = posts[posts.length - 1].updatedAt
      }

      const localBumps = await dbAdapter.getUserLocalBumps(reader.id, oldestPostTime)
      const localBumpedPostIds = localBumps.map((bump) => { return bump.postId })

      const absentPostIds = _.difference(localBumpedPostIds, postIds)
      if (absentPostIds.length > 0) {
        let localBumpedPosts = await dbAdapter.getPostsByIds(absentPostIds, { currentUser: this.currentUser })
        localBumpedPosts = _.sortBy(localBumpedPosts, (post) => {
          return _.indexOf(absentPostIds, post.id)
        })
        posts = localBumpedPosts.concat(posts)
      }

      for (const p of posts) {
        if (localBumpedPostIds.includes(p.id)) {
          const bump = localBumps.find((b) => b.postId === p.id);
          p.bumpedAt = bump.bumpedAt
        }
      }
    }

    posts.sort((p1, p2) => {
      let t1 = p1.updatedAt
      let t2 = p2.updatedAt
      if (p1.bumpedAt) {
        t1 = p1.bumpedAt
      }
      if (p2.bumpedAt) {
        t2 = p2.bumpedAt
      }
      return t2 - t1
    })

    posts = posts.slice(offset, offset + limit)

    const uids = _.uniq(posts.map((post) => post.userId))
    const users = (await dbAdapter.getUsersByIds(uids)).filter(Boolean)
    const readerUserId = this.currentUser
    const banMatrix = await dbAdapter.getBanMatrixByUsersForPostReader(uids, readerUserId)

    const usersCache = {}

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      usersCache[user.id] = [user, banMatrix[i][1]];
    }

    async function userById(id) {
      if (!(id in usersCache)) {
        const user = await dbAdapter.getUserById(id)

        if (!user) {
          throw new Error(`no user for id=${id}`)
        }

        const bans = await user.getBanIds()
        const isReaderBanned = bans.includes(readerUserId)
        usersCache[id] = [user, isReaderBanned]
      }

      return usersCache[id]
    }

    posts = await Promise.all(posts.map(async (post) => {
      if (post.userId === this.currentUser) {
        // shortcut for the author
        return post
      }

      let author, authorBannedReader

      try {
        [author, authorBannedReader] = await userById(post.userId)
      } catch (e) {
        throw new Error(`did not find user-object of author of post with id=${post.id}\nPREVIOUS: ${e.message}`)
      }

      const readerBannedAuthor = banIds.includes(post.userId)

      if (readerBannedAuthor || authorBannedReader)
        return null

      if (author.isPrivate) {
        if (feedOwner.isPrivate !== '1' && (this.isPosts()) || this.isDirects()) {
          return post
        }

        if (_.intersection(post.destinationFeedIds, readerOwnFeeds).length > 0) {
          return post
        }

        if (reader && _.intersection(post.destinationFeedIds, reader.subscribedFeedIds).length > 0) {
          return post
        }

        if (!await post.canShow(this.currentUser, false)) {
          return null
        }
      }

      return post
    }))

    this.posts = posts.filter(Boolean)

    return this.posts
  }

  Timeline.prototype.unmerge = async function (feedIntId) {
    const postIds = await dbAdapter.getTimelinesIntersectionPostIds(this.intId, feedIntId)

    await Promise.all(_.flatten(postIds.map((postId) =>
      dbAdapter.withdrawPostFromFeeds([feedIntId], postId)
    )))

    return
  }

  Timeline.prototype.getUser = async function () {
    if (!this.user) {
      this.user = await dbAdapter.getFeedOwnerById(this.userId);
    }

    return this.user;
  }

  /**
   * Returns the IDs of users subscribed to this timeline, as a promise.
   */
  Timeline.prototype.getSubscriberIds = async function (includeSelf) {
    let userIds = await dbAdapter.getTimelineSubscribersIds(this.id)

    // A user is always subscribed to their own posts timeline.
    if (includeSelf && (this.isPosts() || this.isDirects())) {
      userIds = _.uniq(userIds.concat([this.userId]))
    }

    this.subscriberIds = userIds

    return userIds
  }

  Timeline.prototype.getSubscribers = async function (includeSelf) {
    let users = await dbAdapter.getTimelineSubscribers(this.intId)

    if (includeSelf && (this.isPosts() || this.isDirects())) {
      const currentUser = await dbAdapter.getUserById(this.userId)
      users = users.concat(currentUser)
    }

    this.subscribers = users

    return this.subscribers
  }

  Timeline.prototype.loadVisibleSubscribersAndAdmins = async function (feedOwner, viewer) {
    if (!feedOwner || feedOwner.id != this.userId) {
      throw new Error('Wrong feed owner')
    }

    const feedOwnerSubscriberIds = await feedOwner.getSubscriberIds()

    if (feedOwner.isPrivate !== '1') {
      return
    }

    if (viewer && (viewer.id == feedOwner.id || feedOwnerSubscriberIds.includes(viewer.id))) {
      return
    }

    feedOwner.administrators = []
    this.subscribers = []
    this.user = feedOwner
  }

  /**
   * Returns the list of the 'River of News' timelines of all subscribers to this
   * timeline.
   */
  Timeline.prototype.getSubscribedTimelineIds = async function () {
    const subscribers = await this.getSubscribers(true);
    return await Promise.all(subscribers.map((subscriber) => subscriber.getRiverOfNewsTimelineId()))
  }

  Timeline.prototype.getSubscribersRiversOfNewsIntIds = async function () {
    const subscribers = await this.getSubscribers(true);
    return await Promise.all(subscribers.map((subscriber) => subscriber.getRiverOfNewsTimelineIntId()))
  }

  Timeline.prototype.isRiverOfNews = function () {
    return this.name === 'RiverOfNews'
  }

  Timeline.prototype.isPosts = function () {
    return this.name === 'Posts'
  }

  Timeline.prototype.isLikes = function () {
    return this.name === 'Likes'
  }

  Timeline.prototype.isComments = function () {
    return this.name === 'Comments'
  }

  Timeline.prototype.isDirects = function () {
    return this.name === 'Directs'
  }

  Timeline.prototype.isHides = function () {
    return this.name === 'Hides'
  }

  Timeline.prototype.updatePost = async function (postId, action) {
    if (action === 'like') {
      const postInTimeline = await dbAdapter.isPostPresentInTimeline(this.intId, postId)

      if (postInTimeline) {
        // For the time being, like does not bump post if it is already present in timeline
        return
      }
    }

    const currentTime = new Date().getTime()

    if (action === 'like') {
      await dbAdapter.insertPostIntoFeeds([this.intId], postId)
      if (this.isRiverOfNews()) {
        await dbAdapter.createLocalBump(postId, this.userId)
      }
    } else {
      await Promise.all([
        dbAdapter.insertPostIntoFeeds([this.intId], postId),
        dbAdapter.setPostUpdatedAt(postId, currentTime)
      ])
    }

    // does not update lastActivity on like
    if (action === 'like') {
      return
    }

    const feed = await this.getUser()
    await feed.updateLastActivityAt()
  }

  Timeline.prototype.canShow = async function (readerId) {
    if (this.userId === readerId)
      return true;  // owner can read her posts

    if (this.isDirects())
      return false;  // this is someone else's direct

    const user = await this.getUser();

    if (!user) {
      throw new Error;
    }

    // this feed is not visible to anonymous and we just happen to be one
    if (!readerId && user.isProtected === '1') {
      return false;
    }

    if (user.isPrivate === '1') {
      // user can view post if and only if she is subscriber
      const subscriberIds = await this.getSubscriberIds();
      return subscriberIds.includes(readerId);
    }

    // this is a public feed, anyone can read public posts, this is a free country
    return true;
  };

  return Timeline
}
