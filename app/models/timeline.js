"use strict";

var Promise = require('bluebird')
  , uuid = require('uuid')
  , inherits = require("util").inherits
  , models = require('../models')
  , AbstractModel = models.AbstractModel
  , FeedFactory = models.FeedFactory
  , Post = models.Post
  , pubSub = models.PubSub
  , _ = require('lodash')

exports.addModel = function(dbAdapter) {
  /**
   * @constructor
   */
  var Timeline = function(params) {
    Timeline.super_.call(this)

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

  inherits(Timeline, AbstractModel)

  Timeline.className = Timeline
  Timeline.namespace = "timeline"
  Timeline.initObject = Timeline.super_.initObject
  Timeline.findById = Timeline.super_.findById
  Timeline.findByIds = Timeline.super_.findByIds

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
  Timeline.publishPost = function(post) {
    var that = this
    var currentTime = new Date().getTime()

    // We can use post.timelineIds here instead of post.getPostedToIds
    // because we are about to create that post and have just received
    // a request from user, so postedToIds == timelineIds here
    return Promise.map(post.timelineIds, function(timelineId) {
      return Timeline.findById(timelineId)
    })
      .then(function(timelines) {
        return Promise.map(timelines, function(timeline) {
          return timeline.getUser()
            .then(function(feed) { return feed.updateLastActivityAt() })
            .then(function() { return timeline.getSubscribedTimelineIds() })
        })
      })
      .then(function(allSubscribedTimelineIds) {
        var allTimelines = _.uniq(
          _.union(post.timelineIds, _.flatten(allSubscribedTimelineIds)))
        return Promise.map(allTimelines, function(timelineId) {
          return Promise.all([
            dbAdapter.addPostToTimeline(timelineId, currentTime, post.id),
            dbAdapter.setPostUpdatedAt(post.id, currentTime),
            dbAdapter.createPostUsageInTimeline(post.id, timelineId)
          ])
        })
      })
      .then(function() { return pubSub.newPost(post.id) })
  }

  Timeline.prototype.validate = function() {
    return new Promise(function(resolve, reject) {
      var valid

      valid = this.name
        && this.name.length > 0
        && this.userId
        && this.userId.length > 0

      valid ? resolve(valid) : reject(new Error("Invalid"))
    }.bind(this))
  }

  Timeline.prototype.validateOnCreate = function() {
    var that = this

    return new Promise(function(resolve, reject) {
      Promise.join(that.validate(),
                   that.validateModelUniqueness(Timeline, that.id),
                   function(valid, idIsUnique) {
                     resolve(that)
                   })
        .catch(function(e) { reject(e) })
      })
  }

  Timeline.prototype.create = function() {
    var that = this

    return new Promise(function(resolve, reject) {
      that.createdAt = new Date().getTime()
      that.updatedAt = new Date().getTime()
      if (!that.id)
        that.id = uuid.v4()

      that.validateOnCreate()
        .then(function(timeline) {
          let payload = {
            'name':      that.name,
            'userId':    that.userId,
            'createdAt': that.createdAt.toString(),
            'updatedAt': that.updatedAt.toString()
          }
          return dbAdapter.createTimeline(that.id, payload)
        })
        .then(function(res) { resolve(that) })
        .catch(function(e) { reject(e) })
    })
  }

  Timeline.prototype.createUserDiscussionsTimeline = function() {
    var that = this

    return new Promise(function(resolve, reject) {
      that.createdAt = new Date().getTime()
      that.updatedAt = new Date().getTime()

      that.validate()
        .then(function(timeline) {
          let payload = {
            'name':      that.name,
            'userId':    that.userId,
            'createdAt': that.createdAt.toString(),
            'updatedAt': that.updatedAt.toString()
          }
          return dbAdapter.createUserDiscussionsTimeline(that.userId, payload)
        })
        .then(function(timelineId) { that.id = timelineId })
        .then(function(res) { resolve(that) })
        .catch(function(e) { reject(e) })
    })
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

    let valid = await this.validateCanShow(this.currentUser)

    if (!valid)
      return []

    this.postIds = await dbAdapter.getTimelinePostsRange(this.id, offset, offset + limit - 1)

    return this.postIds
  }

  Timeline.prototype.getPostIdsByScore = function(min, max) {
    var that = this

    return new Promise(function(resolve, reject) {
      dbAdapter.getTimelinePostsInTimeInterval(that.id, min, max)
        .then(function(postIds) {
          that.postIds = postIds
          resolve(that.postIds)
        })
    })
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

    let reader = this.currentUser ? (await models.User.findById(this.currentUser)) : null
    let banIds = reader ? (await reader.getBanIds()) : []

    let postIds = await this.getPostIds(offset, limit)
    let posts = (await Post.findByIds(postIds, { currentUser: this.currentUser })).filter(Boolean)

    let uids = _.uniq(posts.map(post => post.userId))
    let users = (await models.User.findByIds(uids)).filter(Boolean)
    let bans = await Promise.all(users.map(async (user) => user.getBanIds()))

    let usersCache = {}

    for (let i = 0; i < users.length; i++) {
      let user = users[i];
      usersCache[user.id] = [user, bans[i]];
    }

    async function userById(id) {
      if (!(id in usersCache)) {
        let user = await models.User.findById(id)

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

          return timeline.validateCanShow(this.currentUser)
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

    let timeline = await Timeline.findById(timelineId)
    let postIds = await timeline.getPostIds(0, -1)

    let promises = postIds.map(postId => dbAdapter.createPostUsageInTimeline(postId, timelineId))

    await Promise.all(promises)
  }

  Timeline.prototype.unmerge = async function(timelineId) {
    let postIds = await dbAdapter.getTimelinesIntersectionPostIds(this.id, timelineId)

    await Promise.all(_.flatten(postIds.map((postId) => [
      dbAdapter.deletePostUsageInTimeline(postId, timelineId),
      dbAdapter.removePostFromTimeline(timelineId, postId)
    ])))

    return
  }

  Timeline.prototype.getUser = function() {
    return models.FeedFactory.findById(this.userId)
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
    this.subscribers = await models.User.findByIds(userIds)

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
      dbAdapter.addPostToTimeline(this.id, currentTime, postId),
      dbAdapter.createPostUsageInTimeline(postId, this.id),
      dbAdapter.setPostUpdatedAt(postId, currentTime)
    ])

    // does not update lastActivity on like
    if (action === 'like') {
      return null
    }

    var feed = await this.getUser()
    return feed.updateLastActivityAt()
  }

  Timeline.prototype.turnIntoPrivate = function() {
    this.posts = []
    this.postIds = []
    this.limit = 0

    return this
  }

  Timeline.prototype.validateCanShow = async function(userId) {
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
