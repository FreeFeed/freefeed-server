import _ from 'lodash'

import { PubSub as pubSub } from '../models'


export function addModel(dbAdapter, pgAdapter) {
  /**
   * @constructor
   */
  var Comment = function(params) {
    this.id = params.id
    this.body = params.body
    this.userId = params.userId
    this.postId = params.postId
    if (parseInt(params.createdAt, 10))
      this.createdAt = params.createdAt
    if (parseInt(params.updatedAt, 10))
      this.updatedAt = params.updatedAt
  }

  Comment.className = Comment
  Comment.namespace = "comment"

  Object.defineProperty(Comment.prototype, 'body', {
    get: function() { return this.body_ },
    set: function(newValue) {
      newValue ? this.body_ = newValue.trim() : this.body_ = ''
    }
  })

  Comment.prototype.validate = async function() {
    const valid = this.body
               && this.body.length > 0
               && this.userId
               && this.userId.length > 0
               && this.postId
               && this.postId.length > 0

    if (!valid) {
      throw new Error("Invalid")
    }
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

    this.id = await pgAdapter.createComment(payload)

    let post = await pgAdapter.getPostById(this.postId)
    let timelines = await post.addComment(this)

    return timelines
  }

  Comment.prototype.update = async function(params) {
    this.updatedAt = new Date().getTime()
    this.body = params.body

    await this.validate()

    let payload = {
      'body':      this.body,
      'updatedAt': this.updatedAt.toString()
    }
    await pgAdapter.updateComment(this.id, payload)

    await pubSub.updateComment(this.id)

    return this
  }

  Comment.prototype.getPost = function() {
    return pgAdapter.getPostById(this.postId)
  }

  Comment.prototype.destroy = async function() {
    await pubSub.destroyComment(this.id, this.postId)
    await pgAdapter.deleteComment(this.id, this.postId)

    // look for comment from this user in this post
    // if this is was the last one remove this post from user's comments timeline
    let post = await pgAdapter.getPostById(this.postId)
    let comments = await post.getComments()

    if (_.any(comments, 'userId', this.userId)) {
      return true
    }

    let user = await pgAdapter.getUserById(this.userId)
    let timelineId = await user.getCommentsTimelineId()

    return pgAdapter.withdrawPostFromTimeline(timelineId, this.postId)
  }

  Comment.prototype.getCreatedBy = function() {
    return pgAdapter.getUserById(this.userId)
  }

  return Comment
}
