import _ from 'lodash'

import { PubSub as pubSub } from '../models'


export function addModel(dbAdapter) {
  /**
   * @constructor
   */
  var Timeline = function(params) {
    this.id = params.id
    this.intId = params.intId
    this.name = params.name
    this.userId = params.userId
    if (parseInt(params.createdAt, 10))
      this.createdAt = params.createdAt
    if (parseInt(params.updatedAt, 10))
      this.updatedAt = params.updatedAt
    this.offset = parseInt(params.offset, 10) || 0
    this.limit = parseInt(params.limit, 10) || 30
    this.currentUser = params.currentUser
  }

  Timeline.className = Timeline
  Timeline.namespace = "timeline"

  Object.defineProperty(Timeline.prototype, 'name', {
    get: function() { return this.name_ },
    set: function(newValue) {
      newValue ? this.name_ = newValue.trim() : this.name_ = ''
    }
  })

  /**
   * Adds the specified post to all timelines where it needs to appear
   * (the timelines of the feeds to which it is posted, the River of News
   * timeline of the posting user and the River of News timelines of all
   * subscribers of the feeds to which it is posted).
   */

  Timeline.publishPost = async function(post) {
    const currentTime = new Date().getTime()

    // We can use post.timelineIds here instead of post.getPostedToIds
    // because we are about to create that post and have just received
    // a request from user, so postedToIds == timelineIds here
    const timelines = await dbAdapter.getTimelinesByIds(post.timelineIds)

    let promises = timelines.map(async (timeline) => {
      const feed = await timeline.getUser()
      await feed.updateLastActivityAt()

      return timeline.getSubscribersRiversOfNewsIntIds()
    })

    const allSubscribedTimelineIds = _.flatten(await Promise.all(promises))
    const allTimelines = _.uniq(_.union(post.feedIntIds, allSubscribedTimelineIds))
    await dbAdapter.setPostUpdatedAt(post.id, currentTime)
    await dbAdapter.insertPostIntoFeeds(allTimelines, post.id)
    await pubSub.newPost(post.id)
  }

  Timeline.getObjectsByIds = async function (objectIds){
    return dbAdapter.getTimelinesByIds(objectIds)
  }

  Timeline.prototype.validate = async function() {
    const valid = this.name
      && this.name.length > 0
      && this.userId
      && this.userId.length > 0

    if (!valid)
      throw new Error('Invalid')
  }

  Timeline.prototype.create = async function() {
    return this._createTimeline()
  }

  Timeline.prototype._createTimeline = async function() {
    const currentTime = new Date().getTime()

    await this.validate()

    const payload = {
      'name':      this.name,
      'userId':    this.userId,
      'createdAt': currentTime.toString(),
      'updatedAt': currentTime.toString()
    }

    this.id = await dbAdapter.createTimeline(payload)

    this.createdAt = currentTime
    this.updatedAt = currentTime

    return this
  }

  Timeline.prototype.getPostIds = async function(offset, limit) {
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

    let valid = await this.canShow(this.currentUser)

    if (!valid)
      return []

    this.postIds = await dbAdapter.getTimelinePostsRange(this.intId, offset, limit)
    return this.postIds
  }

  Timeline.prototype.getFeedPosts = async function(offset, limit, params, customFeedIds) {
    let valid = await this.canShow(this.currentUser)

    if (!valid)
      return []

    let feedIds = [this.intId]
    if (customFeedIds){
      feedIds = customFeedIds
    }

    return dbAdapter.getFeedsPostsRange(feedIds, offset, limit, params)
  }

  Timeline.prototype.getPosts = async function(offset, limit) {
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

    let reader = this.currentUser ? (await dbAdapter.getUserById(this.currentUser)) : null
    let banIds = reader ? (await reader.getBanIds()) : []
    let readerOwnFeeds = reader ? (await reader.getPublicTimelinesIntIds()) : []
    let feedOwner = await this.getUser()

    let posts
    if (this.name != 'MyDiscussions') {
      posts = await this.getFeedPosts(0, offset + limit, {currentUser: this.currentUser})
    } else {
      const myDiscussionsFeedSourcesIds = await Promise.all([feedOwner.getCommentsTimelineIntId(), feedOwner.getLikesTimelineIntId()])
      posts = await this.getFeedPosts(0, offset + limit, {currentUser: this.currentUser}, myDiscussionsFeedSourcesIds)
    }
    let postIds = posts.map((p)=>{
      return p.id
    })

    if (reader && this.name == 'RiverOfNews') {
      let oldestPostTime
      if (posts[posts.length - 1]) {
        oldestPostTime = posts[posts.length - 1].updatedAt
      }

      let localBumps = await dbAdapter.getUserLocalBumps(reader.id, oldestPostTime)
      let localBumpedPostIds = localBumps.map((bump) => { return bump.postId })

      let absentPostIds = _.difference(localBumpedPostIds, postIds)
      if (absentPostIds.length > 0){
        let localBumpedPosts = await dbAdapter.getPostsByIds(absentPostIds, {currentUser: this.currentUser})
        localBumpedPosts = _.sortBy(localBumpedPosts, (post)=>{
          return _.indexOf(absentPostIds, post.id)
        })
        posts = localBumpedPosts.concat(posts)
      }

      for (let p of posts){
        if(_.includes(localBumpedPostIds, p.id)){
          let bump = _.find(localBumps, (b)=>{ return b.postId === p.id })
          p.bumpedAt = bump.bumpedAt
        }
      }
    }

    posts.sort((p1, p2)=>{
      let t1 = p1.updatedAt
      let t2 = p2.updatedAt
      if (p1.bumpedAt){
        t1 = p1.bumpedAt
      }
      if (p2.bumpedAt){
        t2 = p2.bumpedAt
      }
      return t2 - t1
    })

    posts = posts.slice(offset, offset + limit)

    let uids = _.uniq(posts.map(post => post.userId))
    let users = (await dbAdapter.getUsersByIds(uids)).filter(Boolean)
    const readerUserId = this.currentUser
    const banMatrix = await dbAdapter.getBanMatrixByUsersForPostReader(uids, readerUserId)

    let usersCache = {}

    for (let i = 0; i < users.length; i++) {
      let user = users[i];
      usersCache[user.id] = [user, banMatrix[i][1]];
    }

    async function userById(id) {
      if (!(id in usersCache)) {
        let user = await dbAdapter.getUserById(id)

        if (!user) {
          throw new Error(`no user for id=${id}`)
        }

        let bans = await user.getBanIds()
        const isReaderBanned = bans.indexOf(readerUserId) >= 0
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

      let readerBannedAuthor = (banIds.indexOf(post.userId) >= 0)

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

        let postTimelines = await post.getTimelines()
        let promises = postTimelines.map(async (timeline) => {
          if (!timeline.isPosts() && !timeline.isDirects()) {
            return false
          }

          return timeline.canShow(this.currentUser)
        })

        let wasPostedToReadableFeed = _.any(await Promise.all(promises))

        if (!wasPostedToReadableFeed) {
          return null
        }
      }

      return post
    }))

    this.posts = posts.filter(Boolean)

    return this.posts
  }

  /**
   * Merges contents of this timeline into timeline specified by id
   * @param timelineId
   */
  Timeline.prototype.mergeTo = async function(timelineId) {
    await dbAdapter.createMergedPostsTimeline(timelineId, timelineId, this.intId)

    let timeline = await dbAdapter.getTimelineByIntId(timelineId)
    let postIds = await timeline.getPostIds(0, -1)

    await dbAdapter.createPostsUsagesInTimeline(postIds, [timelineId])
  }

  Timeline.prototype.unmerge = async function(feedIntId) {
    let postIds = await dbAdapter.getTimelinesIntersectionPostIds(this.intId, feedIntId)

    await Promise.all(_.flatten(postIds.map((postId) =>
      dbAdapter.withdrawPostFromFeeds([feedIntId], postId)
    )))

    return
  }

  Timeline.prototype.getUser = function() {
    return dbAdapter.getFeedOwnerById(this.userId)
  }

  /**
   * Returns the IDs of users subscribed to this timeline, as a promise.
   */
  Timeline.prototype.getSubscriberIds = async function(includeSelf) {
    let userIds = await dbAdapter.getTimelineSubscribersIds(this.id)

    // A user is always subscribed to their own posts timeline.
    if (includeSelf && (this.isPosts() || this.isDirects())) {
      userIds = _.uniq(userIds.concat([this.userId]))
    }

    this.subscriberIds = userIds

    return userIds
  }

  Timeline.prototype.getSubscribers = async function(includeSelf) {
    let users = await dbAdapter.getTimelineSubscribers(this.intId)

    if (includeSelf && (this.isPosts() || this.isDirects())) {
      let currentUser = await dbAdapter.getUserById(this.userId)
      users = users.concat(currentUser)
    }

    this.subscribers = users

    return this.subscribers
  }

  /**
   * Returns the list of the 'River of News' timelines of all subscribers to this
   * timeline.
   */
  Timeline.prototype.getSubscribedTimelineIds = async function() {
    var subscribers = await this.getSubscribers(true);
    return await Promise.all(subscribers.map((subscriber) => subscriber.getRiverOfNewsTimelineId()))
  }

  Timeline.prototype.getSubscribersRiversOfNewsIntIds = async function() {
    var subscribers = await this.getSubscribers(true);
    return await Promise.all(subscribers.map((subscriber) => subscriber.getRiverOfNewsTimelineIntId()))
  }

  Timeline.prototype.isRiverOfNews = function() {
    return this.name === "RiverOfNews"
  }

  Timeline.prototype.isPosts = function() {
    return this.name === "Posts"
  }

  Timeline.prototype.isLikes = function() {
    return this.name === "Likes"
  }

  Timeline.prototype.isComments = function() {
    return this.name === "Comments"
  }

  Timeline.prototype.isDirects = function() {
    return this.name === "Directs"
  }

  Timeline.prototype.isHides = function() {
    return this.name === "Hides"
  }

  Timeline.prototype.updatePost = async function(postId, action) {
    if (action === "like") {
      let postInTimeline = await dbAdapter.isPostPresentInTimeline(this.intId, postId)

      if (postInTimeline) {
        // For the time being, like does not bump post if it is already present in timeline
        return
      }
    }

    var currentTime = new Date().getTime()

    if (action === "like") {
      await dbAdapter.insertPostIntoFeeds([this.intId], postId)
      if(this.isRiverOfNews()) {
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

  Timeline.prototype.canShow = async function(userId) {
    // owner can read her posts
    if (this.userId === userId)
      return true

    // if post is already in user's feed then she can read it
    if (this.isDirects())
      return this.userId === userId

    // this is a public feed, anyone can read public posts, this is
    // a free country
    var user = await this.getUser()
    if (user && user.isPrivate !== '1')
      return true

    // otherwise user can view post if and only if she is subscriber
    var userIds = await this.getSubscriberIds()
    return userIds.indexOf(userId) >= 0
  }

  return Timeline
}
