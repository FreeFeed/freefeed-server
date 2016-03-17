import _ from 'lodash'

import { PubSub as pubSub } from '../models'


export function addModel(dbAdapter) {
  /**
   * @constructor
   */
  var Timeline = function(params) {
    this.id = params.id
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

      const ids = await timeline.getSubscribedTimelineIds()
      return ids
    })

    const allSubscribedTimelineIds = _.flatten(await Promise.all(promises))
    const allTimelines = _.uniq(_.union(post.timelineIds, allSubscribedTimelineIds))

    await dbAdapter.setPostUpdatedAt(post.id, currentTime)
    promises = allTimelines.map(timelineId => {
      return dbAdapter.insertPostIntoTimeline(timelineId, currentTime, post.id)
    })

    await Promise.all(_.flatten(promises))
    await pubSub.newPost(post.id)
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
    return this._createTimeline(false)
  }

  Timeline.prototype.createUserDiscussionsTimeline = function() {
    return this._createTimeline(true)
  }

  Timeline.prototype._createTimeline = async function(userDiscussionsTimeline) {
    const currentTime = new Date().getTime()

    await this.validate()

    const payload = {
      'name':      this.name,
      'userId':    this.userId,
      'createdAt': currentTime.toString(),
      'updatedAt': currentTime.toString()
    }

    if (userDiscussionsTimeline){
      this.id = await dbAdapter.createUserDiscussionsTimeline(this.userId, payload)
    } else {
      this.id = await dbAdapter.createTimeline(payload)
    }

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

    this.postIds = await dbAdapter.getTimelinePostsRange(this.id, offset, offset + limit - 1)

    return this.postIds
  }

  Timeline.prototype.getPosts = async function(offset, limit) {
    if (_.isUndefined(offset))
      offset = this.offset
    else if (offset < 0)
      offset = 0

    if (_.isUndefined(limit))
      limit = this.limit
    else if (limit < 0)
      limit = 0

    let reader = this.currentUser ? (await dbAdapter.getUserById(this.currentUser)) : null
    let banIds = reader ? (await reader.getBanIds()) : []

    let postIds = await this.getPostIds(offset, limit)
    postIds = postIds.filter(id => {
      if (!_.isString(id)) {
        console.warn(`got weird id in timeline ${this.id}: ${id}`)  // eslint-disable-line no-console
        return false
      }
      return true
    })

    let posts = (await dbAdapter.getPostsByIds(postIds, { currentUser: this.currentUser })).filter(Boolean)
    posts = posts.filter(post => {
      if (!_.isString(post.userId)) {
        console.warn(`got weird uid (author of post ${post.id}): ${post.userId}`)  // eslint-disable-line no-console
        return false
      }
      return true
    })

    let uids = _.uniq(posts.map(post => post.userId))
    let users = (await dbAdapter.getUsersByIds(uids)).filter(Boolean)
    let bans = await Promise.all(users.map(async (user) => user.getBanIds()))

    let usersCache = {}

    for (let i = 0; i < users.length; i++) {
      let user = users[i];
      usersCache[user.id] = [user, bans[i]];
    }

    async function userById(id) {
      if (!(id in usersCache)) {
        let user = await dbAdapter.getUserById(id)

        if (!user) {
          throw new Error(`no user for id=${id}`)
        }

        let bans = await user.getBanIds()

        usersCache[id] = [user, bans]
      }

      return usersCache[id]
    }

    posts = await Promise.all(posts.map(async (post) => {
      if (post.userId === this.currentUser) {
        // shortcut for the author
        return post
      }

      let author, reverseBanIds

      try {
        [author, reverseBanIds] = await userById(post.userId)
      } catch (e) {
        throw new Error(`did not find user-object of author of post with id=${post.id}\nPREVIOUS: ${e.message}`)
      }

      let readerBannedAuthor = (banIds.indexOf(post.userId) >= 0)
      let authorBannedReader = (reverseBanIds.indexOf(this.currentUser) >= 0)

      if (readerBannedAuthor || authorBannedReader)
        return null

      if (author.isPrivate) {
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
    await dbAdapter.createMergedPostsTimeline(timelineId, timelineId, this.id)

    let timeline = await dbAdapter.getTimelineById(timelineId)
    let postIds = await timeline.getPostIds(0, -1)

    let promises = postIds.map(postId => dbAdapter.createPostUsageInTimeline(postId, timelineId))

    await Promise.all(promises)
  }

  Timeline.prototype.unmerge = async function(timelineId) {
    let postIds = await dbAdapter.getTimelinesIntersectionPostIds(this.id, timelineId)

    await Promise.all(_.flatten(postIds.map((postId) =>
      dbAdapter.withdrawPostFromTimeline(timelineId, postId)
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
    let userIds = await dbAdapter.getTimelineSubscribers(this.id)

    // A user is always subscribed to their own posts timeline.
    if (includeSelf && (this.isPosts() || this.isDirects())) {
      userIds = _.uniq(userIds.concat([this.userId]))
    }

    this.subscriberIds = userIds

    return userIds
  }

  Timeline.prototype.getSubscribers = async function(includeSelf) {
    var userIds = await this.getSubscriberIds(includeSelf)
    this.subscribers = await dbAdapter.getUsersByIds(userIds)

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
      let postInTimeline = await dbAdapter.isPostPresentInTimeline(this.id, postId)

      if (postInTimeline) {
        // For the time being, like does not bump post if it is already present in timeline
        return
      }
    }

    var currentTime = new Date().getTime()

    await Promise.all([
      dbAdapter.insertPostIntoTimeline(this.id, currentTime, postId),
      dbAdapter.setPostUpdatedAt(postId, currentTime)
    ])

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
