import monitor from 'monitor-dog'
import GraphemeBreaker from 'grapheme-breaker'
import _ from 'lodash'

import { Timeline, PubSub as pubSub } from '../models'


export function addModel(pgAdapter) {
  /**
   * @constructor
   */
  var Post = function(params) {
    this.id = params.id
    this.body = params.body
    this.attachments = params.attachments
    this.userId = params.userId
    this.timelineIds = params.timelineIds
    this.currentUser = params.currentUser
    this.commentsDisabled = params.commentsDisabled

    if (parseInt(params.createdAt, 10)) {
      this.createdAt = params.createdAt
    }

    if (parseInt(params.updatedAt, 10)) {
      this.updatedAt = params.updatedAt
    }

    if (params.maxComments != 'all') {
      this.maxComments = parseInt(params.maxComments, 10) || 2
    } else {
      this.maxComments = params.maxComments
    }

    if (params.maxLikes !== 'all') {
      this.maxLikes = parseInt(params.maxLikes, 10) || 3
    } else {
      this.maxLikes = params.maxLikes
    }
  }

  Post.className = Post
  Post.namespace = "post"

  Object.defineProperty(Post.prototype, 'body', {
    get: function() { return this.body_ },
    set: function(newValue) {
      newValue ? this.body_ = newValue.trim() : this.body_ = ''
    }
  })

  Post.prototype.validate = async function() {
    const valid = this.body
               && this.body.length > 0
               && this.userId
               && this.userId.length > 0

    if (!valid) {
      throw new Error("Invalid")
    }

    const len = GraphemeBreaker.countBreaks(this.body)

    if (len > 1500) {
      throw new Error("Maximum post-length is 1500 graphemes")
    }
  }

  Post.prototype.create = async function() {
    this.createdAt = new Date().getTime()
    this.updatedAt = new Date().getTime()

    await this.validate()

    var timer = monitor.timer('posts.create-time')

    let payload = {
      'body': this.body,
      'userId': this.userId,
      'createdAt': this.createdAt.toString(),
      'updatedAt': this.updatedAt.toString(),
      'commentsDisabled': this.commentsDisabled
    }
    // save post to the database
    this.id = await pgAdapter.createPost(payload, this.timelineIds)

    // save nested resources
    await this.linkAttachments()

    await Timeline.publishPost(this)

    timer.stop()
    monitor.increment('posts.creates')

    return this
  }

  Post.prototype.update = async function(params) {
    // Reflect post changes and validate
    this.updatedAt = new Date().getTime()
    this.body = params.body
    await this.validate()

    // Calculate changes in attachments
    let oldAttachments = await this.getAttachmentIds() || []
    let newAttachments = params.attachments || []
    let addedAttachments = newAttachments.filter(i => oldAttachments.indexOf(i) < 0)
    let removedAttachments = oldAttachments.filter(i => newAttachments.indexOf(i) < 0)

    // Update post body in DB
    let payload = {
      'body':      this.body,
      'updatedAt': this.updatedAt.toString()
    }
    await pgAdapter.updatePost(this.id, payload)

    // Update post attachments in DB
    await Promise.all([
      this.linkAttachments(addedAttachments),
      this.unlinkAttachments(removedAttachments)
    ])

    // Finally, publish changes
    await pubSub.updatePost(this.id)

    return this
  }

  Post.prototype.setCommentsDisabled = async function(newValue) {
    // Reflect post changes
    this.commentsDisabled = newValue

    // Update post body in DB
    let payload = {
      'commentsDisabled': this.commentsDisabled
    }
    await pgAdapter.updatePost(this.id, payload)

    // Finally, publish changes
    await pubSub.updatePost(this.id)

    return this
  }

  Post.prototype.destroy = async function() {
    // remove all comments
    const comments = await this.getComments()
    await Promise.all(comments.map(comment => comment.destroy()))

    const timelineIds = await this.getTimelineIds()
    await Promise.all(timelineIds.map(async (timelineId) => {
      await pgAdapter.withdrawPostFromTimeline(timelineId, this.id)
    }))

    await pgAdapter.deletePost(this.id)

    await pubSub.destroyPost(this.id, timelineIds)

    monitor.increment('posts.destroys')
  }

  Post.prototype.getCreatedBy = function() {
    return pgAdapter.getUserById(this.userId)
  }

  Post.prototype.getSubscribedTimelineIds = async function(groupOnly) {
    if (typeof groupOnly === 'undefined')
      groupOnly = false

    let feed = await pgAdapter.getFeedOwnerById(this.userId)

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
    this.subscribedTimelines = await pgAdapter.getTimelinesByIds(timelineIds)

    return this.subscribedTimelines
  }

  Post.prototype.getTimelineIds = async function() {
    var timelineIds = await pgAdapter.getPostUsagesInTimelines(this.id)
    this.timelineIds = timelineIds || []
    return this.timelineIds
  }

  Post.prototype.getTimelines = async function() {
    var timelineIds = await this.getTimelineIds()
    this.timelines = await pgAdapter.getTimelinesByIds(timelineIds)

    return this.timelines
  }

  Post.prototype.getPostedToIds = async function() {
    var timelineIds = await pgAdapter.getPostPostedToIds(this.id)
    this.timelineIds = timelineIds || []
    return this.timelineIds
  }

  Post.prototype.getPostedTo = async function() {
    var timelineIds = await this.getPostedToIds()
    this.postedTo = await pgAdapter.getTimelinesByIds(timelineIds)

    return this.postedTo
  }

  Post.prototype.getGenericFriendOfFriendTimelineIds = async function(user, type) {
    let timelineIds = []

    let timeline = await user['get' + type + 'Timeline']()
    timelineIds.push(timeline.id)

    let postedToIds = await this.getPostedToIds()
    let timelines = await pgAdapter.getTimelinesByIds(postedToIds)
    let timelineOwners = await pgAdapter.getFeedOwnersByIds(timelines.map(tl => tl.userId))

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
    return await pgAdapter.getTimelinesByIds(timelineIds)
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

  Post.prototype.hide = async function(userId) {
    const theUser = await pgAdapter.getUserById(userId)
    const hidesTimelineId = await theUser.getHidesTimelineId()

    await pgAdapter.insertPostIntoTimeline(hidesTimelineId, this.id)

    await pubSub.hidePost(theUser.id, this.id)
  }

  Post.prototype.unhide = async function(userId) {
    const theUser = await pgAdapter.getUserById(userId)
    const hidesTimelineId = await theUser.getHidesTimelineId()

    await pgAdapter.withdrawPostFromTimeline(hidesTimelineId, this.id)

    await pubSub.unhidePost(theUser.id, this.id)
  }

  Post.prototype.addComment = async function(comment) {
    let user = await pgAdapter.getUserById(comment.userId)

    let timelineIds = await this.getPostedToIds()

    // only subscribers are allowed to read direct posts
    if (!await this.isStrictlyDirect()) {
      let moreTimelineIds = await this.getCommentsFriendOfFriendTimelineIds(user)
      timelineIds.push(...moreTimelineIds)

      timelineIds = _.uniq(timelineIds)
    }

    let timelines = await pgAdapter.getTimelinesByIds(timelineIds)

    // no need to post updates to rivers of banned users
    let bannedIds = await user.getBanIds()
    timelines = timelines.filter((timeline) => !(timeline.userId in bannedIds))

    let promises = timelines.map((timeline) => timeline.updatePost(this.id))

    await Promise.all(promises)

    return timelines
  }

  Post.prototype.getOmittedComments = async function() {
    const length = await pgAdapter.getPostCommentsCount(this.id)

    if (length > this.maxComments && length > 3 && this.maxComments != 'all') {
      this.omittedComments = length - this.maxComments
      return this.omittedComments
    }

    return 0
  }

  Post.prototype.getCommentIds = async function() {
    let length = await pgAdapter.getPostCommentsCount(this.id)

    if (length > this.maxComments && length > 3 && this.maxComments != 'all') {
      // `lrange smth 0 0` means "get elements from 0-th to 0-th" (that will be 1 element)
      // if `maxComments` is larger than 2, we'll have more comment ids from the beginning of list
      let commentIds = await pgAdapter.getPostFirstNCommentsIds(this.id, this.maxComments - 1)
      // `lrange smth -1 -1` means "get elements from last to last" (that will be 1 element too)
      let moreCommentIds = await pgAdapter.getPostLastCommentId(this.id)

      this.omittedComments = length - this.maxComments
      this.commentIds = commentIds.concat(moreCommentIds)

      return this.commentIds
    } else {  // eslint-disable-line no-else-return
      // get ALL comment ids
      this.commentIds = await pgAdapter.getAllPostCommentsIds(this.id)
      return this.commentIds
    }
  }

  Post.prototype.getComments = async function() {
    let banIds = []

    if (this.currentUser) {
      let user = await pgAdapter.getUserById(this.currentUser)
      if (user)
        banIds = await user.getBanIds()
    }

    let commentIds = await this.getCommentIds()
    let comments = await pgAdapter.getCommentsByIds(commentIds)

    this.comments = comments.filter(comment => (banIds.indexOf(comment.userId) === -1))

    return this.comments
  }

  Post.prototype.linkAttachments = async function(attachmentList) {
    const attachmentIds = attachmentList || this.attachments || []
    const attachments = await pgAdapter.getAttachmentsByIds(attachmentIds)

    const attachmentPromises = attachments.map((attachment) => {
      if (this.attachments) {
        const pos = this.attachments.indexOf(attachment.id)

        if (pos < 0) {
          this.attachments.push(attachment)
        } else {
          this.attachments[pos] = attachment
        }
      }

      // Update connections in DB

      return pgAdapter.linkAttachmentToPost(attachment.id, this.id)
    })

    await Promise.all(attachmentPromises)
  }

  Post.prototype.unlinkAttachments = async function(attachmentList) {
    const attachmentIds = attachmentList || []
    const attachments = await pgAdapter.getAttachmentsByIds(attachmentIds)

    const attachmentPromises = attachments.map((attachment) => {
      // should we modify `this.attachments` here?

      // Update connections in DB
      return pgAdapter.unlinkAttachmentFromPost(attachment.id, this.id)
    })

    await Promise.all(attachmentPromises)
  }

  Post.prototype.getAttachmentIds = async function() {
    this.attachmentIds = await pgAdapter.getPostAttachments(this.id)
    return this.attachmentIds
  }

  Post.prototype.getAttachments = async function() {
    const attachmentIds = await this.getAttachmentIds()
    this.attachments = await pgAdapter.getAttachmentsByIds(attachmentIds)

    return this.attachments
  }

  Post.prototype.getLikeIds = async function() {
    const omittedLikes = await this.getOmittedLikes()

    let likeIds = await pgAdapter.getPostLikesRange(this.id, omittedLikes)

    if (omittedLikes > 0) {
      const hasUserLikedPost = await pgAdapter.hasUserLikedPost(this.currentUser, this.id)

      if (hasUserLikedPost) {
        if (likeIds.indexOf(this.currentUser) === -1) {
          likeIds = [this.currentUser].concat(likeIds.slice(0, -1))
        } else {
          likeIds = likeIds.sort((a, b) => {
            if (a == this.currentUser)
              return -1

            if (b == this.currentUser)
              return 1

            return 0
          })
        }
      }
    } else {
      let to = 0
      let from = _.findIndex(likeIds, user => (user == this.currentUser))

      if (from > 0) {
        likeIds.splice(to, 0, likeIds.splice(from, 1)[0])
      }
    }

    return likeIds
  }

  Post.prototype.getOmittedLikes = async function() {
    const length = await pgAdapter.getPostLikesCount(this.id)

    if (this.maxLikes !== 'all') {
      const threshold = this.maxLikes + 1

      if (length > threshold) {
        return length - this.maxLikes
      }
    }

    return 0
  }

  Post.prototype.getLikes = async function() {
    let banIds = []

    if (this.currentUser) {
      let user = await pgAdapter.getUserById(this.currentUser)

      if (user) {
        banIds = await user.getBanIds()
      }
    }

    let userIds = (await this.getLikeIds())
      .filter(userId => (banIds.indexOf(userId) === -1))

    let users = await pgAdapter.getUsersByIds(userIds)

    // filter non-existant likers
    this.likes = users.filter(Boolean)

    return this.likes
  }

  Post.prototype.isPrivate = async function() {
    var timelines = await this.getPostedTo()

    var arr = timelines.map(async (timeline) => {
      if (timeline.isDirects())
        return true

      let owner = await pgAdapter.getUserById(timeline.userId)

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

    var timer = monitor.timer('posts.likes.time')
    let timelineIds = await this.getPostedToIds()

    // only subscribers are allowed to read direct posts
    if (!await this.isStrictlyDirect()) {
      let moreTimelineIds = await this.getLikesFriendOfFriendTimelineIds(user)
      timelineIds.push(...moreTimelineIds)

      timelineIds = _.uniq(timelineIds)
    }

    let timelines = await pgAdapter.getTimelinesByIds(timelineIds)

    // no need to post updates to rivers of banned users
    let bannedIds = await user.getBanIds()
    timelines = timelines.filter((timeline) => !(timeline.userId in bannedIds))

    let promises = timelines.map((timeline) => timeline.updatePost(this.id, 'like'))

    promises.push(pgAdapter.createUserPostLike(this.id, user.id))

    await Promise.all(promises)

    timer.stop()
    monitor.increment('posts.likes')
    monitor.increment('posts.reactions')

    return timelines
  }

  Post.prototype.removeLike = async function(userId) {
    let user = await pgAdapter.getUserById(userId)
    var timer = monitor.timer('posts.unlikes.time')
    let timelineId = await user.getLikesTimelineId()
    let promises = [
            pgAdapter.removeUserPostLike(this.id, userId),
            pgAdapter.withdrawPostFromTimeline(timelineId, this.id)
          ]
    await Promise.all(promises)
    await pubSub.removeLike(this.id, userId)

    timer.stop()
    monitor.increment('posts.unlikes')
    monitor.increment('posts.unreactions')

    return true
  }

  Post.prototype.isBannedFor = async function(userId) {
    const user = await pgAdapter.getUserById(userId)
    const banIds = await user.getBanIds()

    const index = banIds.indexOf(this.userId)
    return index >= 0
  }

  Post.prototype.isHiddenIn = async function(timeline) {
    // hides are applicable only to river
    if (!(timeline.isRiverOfNews() || timeline.isHides()))
      return false

    let owner = await timeline.getUser()
    let hidesTimelineId = await owner.getHidesTimelineId()

    return pgAdapter.isPostPresentInTimeline(hidesTimelineId, this.id)
  }

  Post.prototype.canShow = async function(userId) {
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
