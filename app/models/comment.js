import _ from 'lodash'
import GraphemeBreaker from 'grapheme-breaker'

import { PubSub as pubSub } from '../models'


export function addModel(dbAdapter) {
  /**
   * @constructor
   */
  const Comment = function (params) {
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
  Comment.namespace = 'comment'

  Object.defineProperty(Comment.prototype, 'body', {
    get: function () { return this.body_ },
    set: function (newValue) {
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
      throw new Error('Comment text must not be empty')
    }

    const len = GraphemeBreaker.countBreaks(this.body)

    if (len > 1500) {
      throw new Error('Maximum comment length is 1500 characters')
    }
  }

  Comment.prototype.create = async function() {
    this.createdAt = new Date().getTime()
    this.updatedAt = new Date().getTime()

    await this.validate()

    const payload = {
      'body':      this.body,
      'userId':    this.userId,
      'postId':    this.postId,
      'createdAt': this.createdAt.toString(),
      'updatedAt': this.updatedAt.toString()
    }

    this.id = await dbAdapter.createComment(payload)

    const post = await dbAdapter.getPostById(this.postId)
    const timelines = await post.addComment(this)

    await dbAdapter.statsCommentCreated(this.userId)

    return timelines
  }

  Comment.prototype.update = async function(params) {
    this.updatedAt = new Date().getTime()
    this.body = params.body

    await this.validate()

    const payload = {
      'body':      this.body,
      'updatedAt': this.updatedAt.toString()
    }
    await dbAdapter.updateComment(this.id, payload)

    await pubSub.updateComment(this.id)

    return this
  }

  Comment.prototype.getPost = function () {
    return dbAdapter.getPostById(this.postId)
  }

  Comment.prototype.destroy = async function() {
    await pubSub.destroyComment(this.id, this.postId)
    await dbAdapter.deleteComment(this.id, this.postId)
    await dbAdapter.statsCommentDeleted(this.userId)

    // look for comment from this user in this post
    // if this is was the last one remove this post from user's comments timeline
    const post = await dbAdapter.getPostById(this.postId)
    const comments = await post.getComments()

    if (_.some(comments, 'userId', this.userId)) {
      return true
    }

    const user = await dbAdapter.getUserById(this.userId)
    const timelineId = await user.getCommentsTimelineIntId()

    return dbAdapter.withdrawPostFromFeeds([timelineId], this.postId)
  }

  Comment.prototype.getCreatedBy = function () {
    return dbAdapter.getUserById(this.userId)
  }

  return Comment
}
