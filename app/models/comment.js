"use strict";

var Promise = require('bluebird')
  , inherits = require("util").inherits
  , models = require('../models')
  , AbstractModel = models.AbstractModel
  , Post = models.Post
  , User = models.User
  , pubSub = models.PubSub
  , _ = require('lodash')

exports.addModel = function(dbAdapter) {
  /**
   * @constructor
   * @extends AbstractModel
   */
  var Comment = function(params) {
    Comment.super_.call(this)

    this.id = params.id
    this.body = params.body
    this.userId = params.userId
    this.postId = params.postId
    if (parseInt(params.createdAt, 10))
      this.createdAt = params.createdAt
    if (parseInt(params.updatedAt, 10))
      this.updatedAt = params.updatedAt
  }

  inherits(Comment, AbstractModel)

  Comment.className = Comment
  Comment.namespace = "comment"
  Comment.initObject = Comment.super_.initObject
  Comment.findById = Comment.super_.findById
  Comment.findByIds = Comment.super_.findByIds
  Comment.getById = Comment.super_.getById

  Object.defineProperty(Comment.prototype, 'body', {
    get: function() { return this.body_ },
    set: function(newValue) {
      newValue ? this.body_ = newValue.trim() : this.body_ = ''
    }
  })

  Comment.prototype.validate = async function() {
    var valid

    valid = this.body && this.body.length > 0
      && this.userId && this.userId.length > 0
      && this.postId && this.postId.length > 0

    if (!valid) {
      throw new Error("Invalid")
    }

    return this
  }

  Comment.prototype.create = async function() {
    this.createdAt = new Date().getTime()
    this.updatedAt = new Date().getTime()

    await this.validate()

    let payload = {
      'body': this.body,
      'userId': this.userId,
      'postId': this.postId,
      'createdAt': this.createdAt.toString(),
      'updatedAt': this.updatedAt.toString()
    }

    this.id = await dbAdapter.createComment(payload)

    let post = await Post.findById(this.postId)
    let timelines = await post.addComment(this)

    let stats = await models.Stats.findById(this.userId)
    await stats.addComment()

    return timelines
  }

  Comment.prototype.update = function(params) {
    var that = this

    return new Promise(function(resolve, reject) {
      that.updatedAt = new Date().getTime()
      that.body = params.body

      that.validate()
        .then(function(comment) {
          let payload = {
            'body':      that.body,
            'updatedAt': that.updatedAt.toString()
          }
          return dbAdapter.updateComment(that.id, payload)
        })
        .then(function() { return pubSub.updateComment(that.id) })
        .then(function() { resolve(that) })
        .catch(function(e) { reject(e) })
    })
  }

  Comment.prototype.getPost = function() {
    return models.Post.findById(this.postId)
  }

  Comment.prototype.destroy = async function() {
    await pubSub.destroyComment(this.id, this.postId)
    await dbAdapter.deleteComment(this.id)
    await dbAdapter.removeCommentFromPost(this.postId, this.id)

    // look for comment from this user in this post
    // if this is was the last one remove this post from user's comments timeline
    let post = await Post.findById(this.postId)
    let comments = await post.getComments()

    if (_.any(comments, 'userId', this.userId)) {
      return true
    }

    let user = await User.findById(this.userId)
    let timelineId = await user.getCommentsTimelineId()

    await Promise.all([
      dbAdapter.removePostFromTimeline(timelineId, this.postId),
      dbAdapter.deletePostUsageInTimeline(this.postId, timelineId)
    ])

    let stats = await models.Stats.findById(this.userId)
    let res = await stats.removeComment()
    return res
  }

  Comment.prototype.getCreatedBy = function() {
    return models.FeedFactory.findById(this.userId)
  }

  return Comment
}
