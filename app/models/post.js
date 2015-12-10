"use strict";

import config_file from '../../config/config'
import monitor from 'monitor-dog'

var Promise = require('bluebird')
  , uuid = require('uuid')
  , GraphemeBreaker = require('grapheme-breaker')
  , inherits = require("util").inherits
  , models = require('../models')
  , AbstractModel = models.AbstractModel
  , FeedFactory = models.FeedFactory
  , Timeline = models.Timeline
  , mkKey = require("../support/models").mkKey
  , _ = require('lodash')
  , pubSub = models.PubSub

exports.addModel = function(database) {
  /**
   * @constructor
   * @extends AbstractModel
   */
  var Post = function(params) {
    Post.super_.call(this)

    this.id = params.id
    this.body = params.body
    this.attachments = params.attachments
    this.userId = params.userId
    this.timelineIds = params.timelineIds
    this.currentUser = params.currentUser
    if (parseInt(params.createdAt, 10))
      this.createdAt = params.createdAt
    if (parseInt(params.updatedAt, 10))
      this.updatedAt = params.updatedAt
    if (params.maxComments != 'all')
      this.maxComments = parseInt(params.maxComments, 10) || 2
    else
      this.maxComments = params.maxComments
    if (params.maxLikes != 'all')
      this.maxLikes = parseInt(params.maxLikes, 10) || 4
    else
      this.maxLikes = params.maxLikes
  }

  inherits(Post, AbstractModel)

  Post.className = Post
  Post.namespace = "post"
  Post.initObject = Post.super_.initObject
  Post.findById = Post.super_.findById
  Post.findByIds = Post.super_.findByIds
  Post.getById = Post.super_.getById

  Object.defineProperty(Post.prototype, 'body', {
    get: function() { return this.body_ },
    set: function(newValue) {
      newValue ? this.body_ = newValue.trim() : this.body_ = ''
    }
  })

  Post.prototype.validate = async function() {
    var valid

    valid = this.body && this.body.length > 0
      && this.userId && this.userId.length > 0

    if (!valid) {
      throw new Error("Invalid")
    }

    var len = GraphemeBreaker.countBreaks(this.body)

    if (len > 1500) {
      throw new Error("Maximum post-length is 1500 graphemes")
    }

    return this
  }

  Post.prototype.validateOnCreate = async function() {
    var promises = [
      this.validate(),
      this.validateUniquness(mkKey(['post', this.id]))
    ]

    await Promise.all(promises)

    return this
  }

  Post.prototype.create = async function() {
    this.createdAt = new Date().getTime()
    this.updatedAt = new Date().getTime()
    this.id = uuid.v4()

    await this.validateOnCreate()

    var timer = monitor.timer('posts.create-time')

    // save post to the database
    await database.hmsetAsync(mkKey(['post', this.id]),
                              { 'body': this.body,
                                'userId': this.userId,
                                'createdAt': this.createdAt.toString(),
                                'updatedAt': this.updatedAt.toString()
                              })

    // save nested resources
    await Promise.all([
      this.linkAttachments(),
      this.savePostedTo()
    ])

    await models.Timeline.publishPost(this)
    var stats = await models.Stats.findById(this.userId)
    await stats.addPost()

    timer.stop()
    monitor.increment('posts.creates')

    return this
  }

  Post.prototype.savePostedTo = function() {
    return database.saddAsync(mkKey(['post', this.id, 'to']), this.timelineIds)
  }

  Post.prototype.update = async function(params) {
    // Reflect post changes and validate
    this.updatedAt = new Date().getTime()
    this.body = params.body
    this.validate()

    // Calculate changes in attachments
    let oldAttachments = await this.getAttachmentIds() || []
    let newAttachments = params.attachments || []
    let addedAttachments = newAttachments.filter(i => oldAttachments.indexOf(i) < 0)
    let removedAttachments = oldAttachments.filter(i => newAttachments.indexOf(i) < 0)

    // Update post body in DB
    await database.hmsetAsync(mkKey(['post', this.id]),
                              { 'body': this.body,
                                'updatedAt': this.updatedAt.toString()
                              })

    // Update post attachments in DB
    await Promise.all([
      this.linkAttachments(addedAttachments),
      this.unlinkAttachments(removedAttachments)
    ])

    // Finally, publish changes
    await pubSub.updatePost(this.id)

    return this
  }

  Post.prototype.destroy = function() {
    var that = this

    return new Promise(function(resolve, reject) {
      // remove all comments
      that.getComments()
        .then(function(comments) {
          return Promise.map(comments, function(comment) {
            return comment.destroy()
          })
        })
        // decrement likes counter for users who liked this post
        .then(function() {
          return that.getLikeIds()
        })
        .then(function(userIds) {
          return Promise.map(userIds, function(userId) {
            return models.Stats.findById(userId).then(function(stats) {
              return stats.removeLike()
            })
          })
        })
        .then(function() {
          return pubSub.destroyPost(that.id)
        })
        .then(function() {
          Promise.all([
            // remove post from all timelines
            that.getTimelineIds()
              .then(function(timelineIds) {
                Promise.map(timelineIds, function(timelineId) {
                  return Promise.all([
                    database.sremAsync(mkKey(['post', that.id, 'timelines']), timelineId),
                    database.zremAsync(mkKey(['timeline', timelineId, 'posts']), that.id),
                  ])
                    .then(function() {
                      database.zcardAsync(mkKey(['timeline', timelineId, 'posts']))
                        .then(function(res) {
                          // that timeline is empty
                          if (res === 0)
                            database.delAsync(mkKey(['post', that.id, 'timelines']))
                        })
                    })
                })
              }),
            // delete posted to key
            database.delAsync(mkKey(['post', that.id, 'to'])),
            // delete likes
            database.delAsync(mkKey(['post', that.id, 'likes'])),
            // delete post
            database.delAsync(mkKey(['post', that.id]))
          ])
        })
        // delete orphaned keys
        .then(function() {
          database.scardAsync(mkKey(['post', that.id, 'timelines']))
            .then(function(res) {
              // post does not belong to any timelines
              if (res === 0)
                database.delAsync(mkKey(['post', that.id, 'timelines']))
            })
        })
        .then(function() { return database.delAsync(mkKey(['post', that.id, 'comments'])) })
        .then(function() { return models.Stats.findById(that.userId) })
        .then(function(stats) { return stats.removePost() })
        .then(function(res) {
          monitor.increment('posts.destroys')
          resolve(res)
        })
    })
  }

  Post.prototype.getCreatedBy = function() {
    return models.User.findById(this.userId)
  }

  Post.prototype.getSubscribedTimelineIds = async function(groupOnly) {
    if (typeof groupOnly === 'undefined')
      groupOnly = false

    let feed = await FeedFactory.findById(this.userId)

    let feeds = [feed.getRiverOfNewsTimelineId()]
    if (!groupOnly)
      feeds.push(feed.getPostsTimelineId())

    let timelineIds = await Promise.all(feeds)
    let newTimelineIds = await this.getTimelineIds()

    timelineIds = timelineIds.concat(newTimelineIds)
    return _.uniq(timelineIds)
  }

  Post.prototype.getSubscribedTimelines = async function() {
    var timelineIds = await this.getSubscribedTimelineIds()
    var timelines = await Promise.all(timelineIds.map((timelineId) => models.Timeline.findById(timelineId)))
    this.subscribedTimelines = timelines
    return this.subscribedTimelines
  }

  Post.prototype.getTimelineIds = async function() {
    var timelineIds = await database.smembersAsync(mkKey(['post', this.id, 'timelines']))
    this.timelineIds = timelineIds || []
    return this.timelineIds
  }

  Post.prototype.getTimelines = async function() {
    var timelineIds = await this.getTimelineIds()
    this.timelines = await models.Timeline.findByIds(timelineIds)

    return this.timelines
  }

  Post.prototype.getPostedToIds = async function() {
    var timelineIds = await database.smembersAsync(mkKey(['post', this.id, 'to']))
    this.timelineIds = timelineIds || []
    return this.timelineIds
  }

  Post.prototype.getPostedTo = async function() {
    var timelineIds = await this.getPostedToIds()
    var timelines = await Promise.all(timelineIds.map((timelineId) => models.Timeline.findById(timelineId)))
    this.postedTo = timelines
    return this.postedTo
  }

  Post.prototype.getGenericFriendOfFriendTimelineIds = async function(user, type) {
    let timelineIds = []

    let timeline = await user['get' + type + 'Timeline']()
    timelineIds.push(timeline.id)

    let postedToIds = await this.getPostedToIds()
    let timelines = await models.Timeline.findByIds(postedToIds)
    let timelineOwners = await models.FeedFactory.findByIds(timelines.map(tl => tl.userId))

    // Adds the specified post to River of News if and only if
    // that post has been published to user's Post timeline,
    // otherwise this post will stay in group(s) timelines
    let groupOnly = true

    if (_.any(timelineOwners.map((owner) => owner.isUser()))) {
      groupOnly = false

      let feeds = await timeline.getSubscribers()
      timelineIds.push(...await Promise.all(feeds.map(feed => feed.getRiverOfNewsTimelineId())))
    }

    timelineIds.push(...await this.getSubscribedTimelineIds(groupOnly))
    timelineIds.push(await user.getRiverOfNewsTimelineId())
    timelineIds = _.uniq(timelineIds)

    return timelineIds
  }

  Post.prototype.getGenericFriendOfFriendTimelines = async function(user, type) {
    let timelineIds = await this.getGenericFriendOfFriendTimelineIds(user, type)
    let promises = timelineIds.map(timelineId => models.Timeline.findById(timelineId))

    return await Promise.all(promises)
  }

  Post.prototype.getPostsFriendOfFriendTimelineIds = function(user) {
    return this.getGenericFriendOfFriendTimelineIds(user, 'Posts')
  }

  Post.prototype.getPostsFriendOfFriendTimelines = function(user) {
    return this.getGenericFriendOfFriendTimelines(user, 'Posts')
  }

  Post.prototype.getLikesFriendOfFriendTimelineIds = function(user) {
    return this.getGenericFriendOfFriendTimelineIds(user, 'Likes')
  }

  Post.prototype.getLikesFriendOfFriendTimelines = function(user) {
    return this.getGenericFriendOfFriendTimelines(user, 'Likes')
  }

  Post.prototype.getCommentsFriendOfFriendTimelineIds = function(user) {
    return this.getGenericFriendOfFriendTimelineIds(user, 'Comments')
  }

  Post.prototype.getCommentsFriendOfFriendTimelines = function(user) {
    return this.getGenericFriendOfFriendTimelines(user, 'Comments')
  }

  Post.prototype.hide = function(userId) {
    var that = this

    return new Promise(function(resolve, reject) {
      let theUser

      models.User.findById(userId)
        .then(function(user) {
          theUser = user
          return pubSub.hidePost(user.id, that.id)
        })
        .then(function() { return theUser.getHidesTimelineId() })
        .then(function(timelineId) {
          return Promise.all([
            database.zaddAsync(mkKey(['timeline', timelineId, 'posts']), that.updatedAt, that.id),
            database.saddAsync(mkKey(['post', that.id, 'timelines']), timelineId)
          ])
        })
        .then(function(res) { resolve(res) })
    })
  }

  Post.prototype.unhide = function(userId) {
    var that = this

    return new Promise(function(resolve, reject) {
      let theUser

      models.User.findById(userId)
        .then(function(user) {
          theUser = user
          return pubSub.unhidePost(user.id, that.id)
        })
        .then(function() { return theUser.getHidesTimelineId() })
        .then(function(timelineId) {
          return Promise.all([
            database.zremAsync(mkKey(['timeline', timelineId, 'posts']), that.id),
            database.sremAsync(mkKey(['post', that.id, 'timelines']), timelineId)
          ])
        })
        .then(function(res) { resolve(res) })
    })
  }

  Post.prototype.addComment = async function(comment) {
    let user = await models.User.findById(comment.userId)

    let subscriberIds = await user.getSubscriberIds()
    let bannedIds = await user.getBanIds()

    let timelineIds = await this.getPostedToIds()

    // only subscribers are allowed to read direct posts
    if (!await this.isStrictlyDirect()) {
      let moreTimelineIds = await this.getCommentsFriendOfFriendTimelineIds(user)
      timelineIds.push(...moreTimelineIds)

      timelineIds = _.uniq(timelineIds)
    }

    let timelines = await Promise.all(timelineIds.map(id => models.Timeline.findById(id)))

    // no need to post updates to rivers of banned users
    timelines = timelines.filter((timeline) => !(timeline.userId in bannedIds))

    let promises = timelines.map((timeline) => timeline.updatePost(this.id))
    promises.push(database.rpushAsync(mkKey(['post', this.id, 'comments']), comment.id))
    promises.push(pubSub.newComment(comment, timelines))

    await Promise.all(promises)

    return timelines
  }

  Post.prototype.getOmittedComments = function() {
    var that = this

    return new Promise(function(resolve, reject) {
      database.llenAsync(mkKey(['post', that.id, 'comments']))
        .then(function(length) {
          if (length > that.maxComments && length > 3 && that.maxComments != 'all') {
            that.omittedComments = length - that.maxComments
            return resolve(that.omittedComments)
          }

          return resolve(0)
        })
    })
  }

  Post.prototype.getCommentIds = async function() {
    let length = await database.llenAsync(mkKey(['post', this.id, 'comments']))

    if (length > this.maxComments && length > 3 && this.maxComments != 'all') {
      // `lrange smth 0 0` means "get elements from 0-th to 0-th" (that will be 1 element)
      // if `maxComments` is larger than 2, we'll have more comment ids from the beginning of list
      let commentIds = await database.lrangeAsync(mkKey(['post', this.id, 'comments']), 0, this.maxComments - 2)
      // `lrange smth -1 -1` means "get elements from last to last" (that will be 1 element too)
      let moreCommentIds = await database.lrangeAsync(mkKey(['post', this.id, 'comments']), -1, -1)

      this.omittedComments = length - this.maxComments
      this.commentIds = commentIds.concat(moreCommentIds)

      return this.commentIds
    } else {
      // get ALL comment ids
      this.commentIds = await database.lrangeAsync(mkKey(['post', this.id, 'comments']), 0, -1)
      return this.commentIds
    }
  }

  Post.prototype.getComments = async function() {
    let banIds = []

    if (this.currentUser) {
      let user = await models.User.findById(this.currentUser)
      if (user)
        banIds = await user.getBanIds()
    }

    let commentIds = await this.getCommentIds()
    let comments = await models.Comment.findByIds(commentIds)

    this.comments = comments.filter(comment => (banIds.indexOf(comment.userId) === -1))

    return this.comments
  }

  Post.prototype.linkAttachments = function(attachmentList) {
    var that = this
    var attachments = attachmentList || that.attachments || []

    var attachmentPromises = attachments.map(function(attachmentId, index) {
      return new Promise(function(resolve, reject) {
        models.Attachment.findById(attachmentId)
          .then(function(attachment) {
            // Replace attachment ids with attachment objects (on create-post)
            if (that.attachments) {
              let pos = that.attachments.indexOf(attachmentId)
              if (pos < 0) {
                that.attachments.push(attachment)
              } else {
                that.attachments[pos] = attachment
              }
            }

            // Update connections in DB
            return Promise.all([
              database.rpushAsync(mkKey(['post', that.id, 'attachments']), attachmentId),
              database.hsetAsync(mkKey(['attachment', attachmentId]), 'postId', that.id)
            ])
          })
          .then(function(res) { resolve(res) })
      })
    })

    return Promise.settle(attachmentPromises)
  }

  Post.prototype.unlinkAttachments = function(attachmentList) {
    var that = this
    var attachments = attachmentList || []

    var attachmentPromises = attachments.map(function(attachmentId, index) {
      return new Promise(function(resolve, reject) {
        models.Attachment.findById(attachmentId)
          .then(function(attachment) {
            // Update connections in DB
            return Promise.all([
              database.lremAsync(mkKey(['post', that.id, 'attachments']), 0, attachmentId),
              database.hsetAsync(mkKey(['attachment', attachmentId]), 'postId', '')
            ])
          })
          .then(function(res) { resolve(res) })
      })
    })

    return Promise.settle(attachmentPromises)
  }

  Post.prototype.getAttachmentIds = function() {
    var that = this

    return new Promise(function(resolve, reject) {
      database.lrangeAsync(mkKey(['post', that.id, 'attachments']), 0, -1)
        .then(function(attachmentIds) {
          that.attachmentIds = attachmentIds
          resolve(attachmentIds)
        })
    })
  }

  Post.prototype.getAttachments = function() {
    var that = this

    return new Promise(function(resolve, reject) {
      that.getAttachmentIds()
        .then(function(attachmentIds) {
          return Promise.map(attachmentIds, function(attachmentId) {
            return models.Attachment.findById(attachmentId)
          })
        })
        .then(function(attachments) {
          that.attachments = attachments
          resolve(that.attachments)
        })
    })
  }

  Post.prototype.getLikeIds = async function() {
    let length = await database.zcardAsync(mkKey(['post', this.id, 'likes']))

    if (length > this.maxLikes && this.maxLikes != 'all') {
      let score = await database.zscoreAsync(mkKey(['post', this.id, 'likes']), this.currentUser)
      let includeUser = score && score >= 0

      let likeIds = await database.zrevrangeAsync(mkKey(['post', this.id, 'likes']), 0, this.maxLikes - 1)

      this.likeIds = likeIds
      this.omittedLikes = length - this.maxLikes

      if (includeUser) {
        if (likeIds.indexOf(this.currentUser) == -1) {
          this.likeIds = [this.currentUser].concat(this.likeIds.slice(0, -1))
        } else {
          this.likeIds = this.likeIds.sort(function(a, b) {
            if (a == this.currentUser) return -1
            if (b == this.currentUser) return 1
          })
        }
      }

      return this.likeIds.slice(0, this.maxLikes)
    } else {
      let likeIds = await database.zrevrangeAsync(mkKey(['post', this.id, 'likes']), 0, -1)

      let to = 0
      let from = _.findIndex(likeIds, user => (user == this.currentUser))

      if (from > 0) {
        likeIds.splice(to, 0, likeIds.splice(from, 1)[0])
      }

      this.likeIds = likeIds

      return this.likeIds
    }
  }

  Post.prototype.getOmittedLikes = function() {
    var that = this

    return new Promise(function(resolve, reject) {
      database.zcardAsync(mkKey(['post', that.id, 'likes']))
        .then(function(length) {
          if (length > that.maxLikes && that.maxLikes != 'all') {
            database.zscoreAsync(mkKey(['post', that.id, 'likes']), that.currentUser).bind({})
              .then(function(score) { this.includeUser = score && score >= 0 })
              .then(function() {
                return database.zrevrangeAsync(mkKey(['post', that.id, 'likes']), 0, that.maxLikes - 1)
              })
              .then(function(likeIds) {
                that.omittedLikes = length - that.maxLikes
                resolve(that.omittedLikes)
              })
          } else {
            resolve(0)
          }
        })
    })
  }

  Post.prototype.getLikes = async function() {
    let banIds = []

    if (this.currentUser) {
      let user = await models.User.findById(this.currentUser)

      if (user) {
        banIds = await user.getBanIds()
      }
    }

    let userIds = await this.getLikeIds()

    let userPromises = userIds.map(async (userId) => {
      return banIds.indexOf(userId) >= 0 ? null : models.User.findById(userId)
    })

    let users = await Promise.all(userPromises)

    // filter null comments
    this.likes = users.filter(Boolean)

    return this.likes
  }

  Post.prototype.isPrivate = async function() {
    var timelines = await this.getPostedTo()

    var arr = timelines.map(async (timeline) => {
      if (timeline.isDirects())
        return true

      let owner = await models.User.findById(timeline.userId)

      return (owner.isPrivate === '1')
    })

    // one public timeline is enough
    return _.every(await Promise.all(arr))
  }

  Post.prototype.isStrictlyDirect = async function() {
    let timelines = await this.getPostedTo()
    let flags = timelines.map((timeline) => timeline.isDirects())

    // one non-direct timeline is enough
    return _.every(flags)
  }

  Post.prototype.addLike = async function(user) {
    await user.validateCanLikePost(this)

    var timer = monitor.timer('posts.likes.time')
    let timelineIds = await this.getPostedToIds()

    // only subscribers are allowed to read direct posts
    if (!await this.isStrictlyDirect()) {
      let moreTimelineIds = await this.getLikesFriendOfFriendTimelineIds(user)
      timelineIds.push(...moreTimelineIds)

      timelineIds = _.uniq(timelineIds)
    }

    let timelines = await Promise.all(timelineIds.map(id => models.Timeline.findById(id)))

    // no need to post updates to rivers of banned users
    let bannedIds = await user.getBanIds()
    timelines = timelines.filter((timeline) => !(timeline.userId in bannedIds))

    let promises = timelines.map((timeline) => timeline.updatePost(this.id, 'like'))

    var now = new Date().getTime()
    promises.push(database.zaddAsync(mkKey(['post', this.id, 'likes']), now, user.id))

    await Promise.all(promises)

    timer.stop()
    monitor.increment('posts.likes')
    monitor.increment('posts.reactions')

    return timelines
  }

  Post.prototype.removeLike = async function(userId) {
    let user = await models.User.findById(userId)
    await user.validateCanUnLikePost(this)
    var timer = monitor.timer('posts.unlikes.time')
    let timelineId = await user.getLikesTimelineId()
    await* [
            database.zremAsync(mkKey(['post', this.id, 'likes']), userId),
            database.zremAsync(mkKey(['timeline', timelineId, 'posts']), this.id),
            database.sremAsync(mkKey(['post', this.id, 'timelines']), timelineId)
          ]
    await pubSub.removeLike(this.id, userId)

    timer.stop()
    monitor.increment('posts.unlikes')
    monitor.increment('posts.unreactions')

    let stats = await models.Stats.findById(userId)
    return stats.removeLike()
  }

  Post.prototype.getCreatedBy = function() {
    return models.FeedFactory.findById(this.userId)
  }

  Post.prototype.isBannedFor = function(userId) {
    var that = this

    return new Promise(function(resolve, reject) {
      models.User.findById(userId)
        .then(function(user) { return user.getBanIds() })
        .then(function(banIds) { return banIds.indexOf(that.userId) })
        .then(function(index) { resolve(index >= 0) })
    })
  }

  Post.prototype.isHiddenIn = async function(timeline) {
    // hides are applicable only to river
    if (!(timeline.isRiverOfNews() || timeline.isHides()))
      return false

    let owner = await timeline.getUser()
    let hidesTimelineId = await owner.getHidesTimelineId()

    let score = await database.zscoreAsync(mkKey(['timeline', hidesTimelineId, 'posts']), this.id)

    return (score && score >= 0)
  }

  Post.prototype.validateCanShow = async function(userId) {
    var timelines = await this.getPostedTo()

    var arr = await Promise.all(timelines.map(async function(timeline) {
      // owner can read her posts
      if (timeline.userId === userId)
        return true

      // if post is already in user's feed then she can read it
      if (timeline.isDirects())
        return timeline.userId === userId

      // this is a public feed, anyone can read public posts, this is
      // a free country
      var user = await timeline.getUser()
      if (user.isPrivate !== '1')
        return true

      // otherwise user can view post if and only if she is subscriber
      var userIds = await timeline.getSubscriberIds()
      return userIds.indexOf(userId) >= 0
    }))

    return _.reduce(arr, function(acc, x) { return acc || x }, false)
  }

  return Post
}
