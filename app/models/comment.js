import _ from 'lodash'
import GraphemeBreaker from 'grapheme-breaker'
import twitter from 'twitter-text'

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

  Reflect.defineProperty(Comment.prototype, 'body', {
    get: function () { return this.body_ },
    set: function (newValue) {
      newValue ? this.body_ = newValue.trim() : this.body_ = ''
    }
  })

  Comment.prototype.validate = async function () {
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

  Comment.prototype.create = async function () {
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

    await this.processHashtagsOnCreate()

    await dbAdapter.statsCommentCreated(this.userId)

    return timelines
  }

  Comment.prototype.update = async function (params) {
    this.updatedAt = new Date().getTime()
    this.body = params.body

    await this.validate()

    const payload = {
      'body':      this.body,
      'updatedAt': this.updatedAt.toString()
    }
    await dbAdapter.updateComment(this.id, payload)

    await this.processHashtagsOnUpdate()

    await pubSub.updateComment(this.id)

    return this
  }

  Comment.prototype.getPost = function () {
    return dbAdapter.getPostById(this.postId)
  }

  Comment.prototype.destroy = async function () {
    await dbAdapter.deleteComment(this.id, this.postId);
    await dbAdapter.statsCommentDeleted(this.userId);
    await pubSub.destroyComment(this.id, this.postId);

    // Look for other comments from this user in the post:
    // if this was the last one then remove the post from "user's comments" timeline
    const post = await dbAdapter.getPostById(this.postId);
    const comments = await post.getComments();

    if (!_.some(comments, ['userId', this.userId])) {
      const user = await dbAdapter.getUserById(this.userId);
      const timelineId = await user.getCommentsTimelineIntId();

      await dbAdapter.withdrawPostFromFeeds([timelineId], this.postId);
    }
  };

  Comment.prototype.getCreatedBy = function () {
    return dbAdapter.getUserById(this.userId)
  }

  Comment.prototype.processHashtagsOnCreate = async function () {
    const commentTags = _.uniq(twitter.extractHashtags(this.body.toLowerCase()))

    if (!commentTags || commentTags.length == 0) {
      return
    }
    await dbAdapter.linkCommentHashtagsByNames(commentTags, this.id)
  }

  Comment.prototype.processHashtagsOnUpdate = async function () {
    const linkedCommentHashtags = await dbAdapter.getCommentHashtags(this.id)

    const presentTags    = _.sortBy(linkedCommentHashtags.map((t) => t.name))
    const newTags        = _.sortBy(_.uniq(twitter.extractHashtags(this.body.toLowerCase())))
    const notChangedTags = _.intersection(presentTags, newTags)
    const tagsToUnlink   = _.difference(presentTags, notChangedTags)
    const tagsToLink     = _.difference(newTags, notChangedTags)

    if (presentTags != newTags) {
      if (tagsToUnlink.length > 0) {
        await dbAdapter.unlinkCommentHashtagsByNames(tagsToUnlink, this.id)
      }
      if (tagsToLink.length > 0) {
        await dbAdapter.linkCommentHashtagsByNames(tagsToLink, this.id)
      }
    }
  }

  return Comment
}
