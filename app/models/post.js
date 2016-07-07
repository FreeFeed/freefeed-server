import monitor from 'monitor-dog'
import GraphemeBreaker from 'grapheme-breaker'
import _ from 'lodash'

import { Timeline, PubSub as pubSub } from '../models'


export function addModel(dbAdapter) {
  /**
   * @constructor
   */
  var Post = function (params) {
    this.id               = params.id
    this.body             = params.body
    this.attachments      = params.attachments
    this.userId           = params.userId
    this.timelineIds      = params.timelineIds
    this.currentUser      = params.currentUser
    this.commentsDisabled = params.commentsDisabled
    this.feedIntIds       = params.feedIntIds || []
    this.destinationFeedIds = params.destinationFeedIds || []
    this.commentsCount    = params.commentsCount
    this.likesCount       = params.likesCount

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
    get: function () { return this.body_ },
    set: function (newValue) {
      newValue ? this.body_ = newValue.trim() : this.body_ = ''
    }
  })

  Post.prototype.validate = async function() {
    const valid = this.body
               && this.body.length > 0
               && this.userId
               && this.userId.length > 0

    if (!valid) {
      throw new Error("Post text must not be empty")
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
      'body':             this.body,
      'userId':           this.userId,
      'createdAt':        this.createdAt.toString(),
      'updatedAt':        this.updatedAt.toString(),
      'commentsDisabled': this.commentsDisabled
    }
    this.feedIntIds = await dbAdapter.getTimelinesIntIdsByUUIDs(this.timelineIds)
    this.destinationFeedIds = this.feedIntIds.slice()
    // save post to the database
    this.id = await dbAdapter.createPost(payload, this.feedIntIds)

    // save nested resources
    await this.linkAttachments()

    await Timeline.publishPost(this)

    await dbAdapter.statsPostCreated(this.userId)

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
    await dbAdapter.updatePost(this.id, payload)

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
    await dbAdapter.updatePost(this.id, payload)

    // Finally, publish changes
    await pubSub.updatePost(this.id)

    return this
  }

  Post.prototype.destroy = async function() {
    // remove all comments
    const comments = await this.getComments()
    await Promise.all(comments.map(comment => comment.destroy()))

    const timelineIds = await this.getTimelineIds()
    await dbAdapter.withdrawPostFromFeeds(this.feedIntIds, this.id)
    await dbAdapter.deletePost(this.id)

    await pubSub.destroyPost(this.id, timelineIds)

    await dbAdapter.statsPostDeleted(this.userId)

    monitor.increment('posts.destroys')
  }

  Post.prototype.getCreatedBy = function () {
    return dbAdapter.getUserById(this.userId)
  }

  Post.prototype.getSubscribedTimelineIds = async function(groupOnly) {
    if (typeof groupOnly === 'undefined')
      groupOnly = false

    let feed = await dbAdapter.getFeedOwnerById(this.userId)

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
    this.subscribedTimelines = await dbAdapter.getTimelinesByIds(timelineIds)

    return this.subscribedTimelines
  }

  Post.prototype.getTimelineIds = async function() {
    var timelineIds = await dbAdapter.getPostUsagesInTimelines(this.id)
    this.timelineIds = timelineIds || []
    return this.timelineIds
  }

  Post.prototype.getTimelines = async function() {
    this.timelines = await dbAdapter.getTimelinesByIntIds(this.feedIntIds)

    return this.timelines
  }

  Post.prototype.getPostedToIds = async function() {
    let timelineIds = await dbAdapter.getTimelinesUUIDsByIntIds(this.destinationFeedIds)
    this.timelineIds = timelineIds || []
    return this.timelineIds
  }

  Post.prototype.getPostedTo = async function() {
    this.postedTo = await dbAdapter.getTimelinesByIntIds(this.destinationFeedIds)

    return this.postedTo
  }

  Post.prototype.getGenericFriendOfFriendTimelineIntIds = async function(user, type) {
    let timelineIntIds = []

    let userTimelineIntId = await user['get' + type + 'TimelineIntId']()
    let timeline = await dbAdapter.getTimelineByIntId(userTimelineIntId)
    timelineIntIds.push(userTimelineIntId)

    let timelines = await dbAdapter.getTimelinesByIntIds(this.destinationFeedIds)
    let timelineOwners = await dbAdapter.getFeedOwnersByIds(timelines.map(tl => tl.userId))

    // Adds the specified post to River of News if and only if
    // that post has been published to user's Post timeline,
    // otherwise this post will stay in group(s) timelines
    let groupOnly = true

    if (_.any(timelineOwners.map((owner) => owner.isUser()))) {
      groupOnly = false

      let subscribersIds = await timeline.getSubscriberIds()
      let subscribersRiversOfNewsIntIds = await dbAdapter.getUsersNamedFeedsIntIds(subscribersIds, ['RiverOfNews'])
      timelineIntIds.push(subscribersRiversOfNewsIntIds)
    }

    let postAuthor = await dbAdapter.getFeedOwnerById(this.userId)
    timelineIntIds.push(await postAuthor.getRiverOfNewsTimelineIntId())

    if (!groupOnly) {
      timelineIntIds.push(await postAuthor.getPostsTimelineIntId())
    }

    timelineIntIds.push(await user.getRiverOfNewsTimelineIntId())
    timelineIntIds.push(this.feedIntIds)
    timelineIntIds = _.uniq(_.flatten(timelineIntIds))

    return timelineIntIds
  }

  Post.prototype.getLikesFriendOfFriendTimelineIntIds = function (user) {
    return this.getGenericFriendOfFriendTimelineIntIds(user, 'Likes')
  }

  Post.prototype.getCommentsFriendOfFriendTimelineIntIds = function (user) {
    return this.getGenericFriendOfFriendTimelineIntIds(user, 'Comments')
  }

  Post.prototype.hide = async function(userId) {
    const theUser = await dbAdapter.getUserById(userId)
    const hidesTimelineId = await theUser.getHidesTimelineIntId()

    await dbAdapter.insertPostIntoFeeds([hidesTimelineId], this.id)

    await pubSub.hidePost(theUser.id, this.id)
  }

  Post.prototype.unhide = async function(userId) {
    const theUser = await dbAdapter.getUserById(userId)
    const hidesTimelineId = await theUser.getHidesTimelineIntId()

    await dbAdapter.withdrawPostFromFeeds([hidesTimelineId], this.id)

    await pubSub.unhidePost(theUser.id, this.id)
  }

  Post.prototype.addComment = async function(comment) {
    let user = await dbAdapter.getUserById(comment.userId)

    let timelineIntIds = this.destinationFeedIds.slice()

    // only subscribers are allowed to read direct posts
    if (!await this.isStrictlyDirect()) {
      let moreTimelineIntIds = await this.getCommentsFriendOfFriendTimelineIntIds(user)
      timelineIntIds.push(...moreTimelineIntIds)

      timelineIntIds = _.uniq(timelineIntIds)
    }

    let timelines = await dbAdapter.getTimelinesByIntIds(timelineIntIds)

    // no need to post updates to rivers of banned users
    let bannedIds = await user.getBanIds()
    timelines = timelines.filter((timeline) => !(timeline.userId in bannedIds))

    await this.publishChangesToFeeds(timelines, false)

    return timelines
  }

  Post.prototype.publishChangesToFeeds = async function(timelines, isLikeAction = false) {
    let feedsIntIds = timelines.map((t)=> t.intId)
    let insertIntoFeedIds = _.difference(feedsIntIds, this.feedIntIds)
    let timelineOwnersIds = timelines.map((t)=> t.userId)
    let riversOfNewsOwners = timelines.map((t)=> {
      if (t.isRiverOfNews() && _.includes(insertIntoFeedIds, t.intId)) {
        return t.userId
      }
      return null
    })

    riversOfNewsOwners = _.compact(riversOfNewsOwners)

    if (insertIntoFeedIds.length > 0) {
      await dbAdapter.insertPostIntoFeeds(insertIntoFeedIds, this.id)
    }

    if (isLikeAction) {
      if (insertIntoFeedIds.length == 0) {
        // For the time being, like does not bump post if it is already present in timeline
        return
      }

      let promises = riversOfNewsOwners.map((ownerId)=> dbAdapter.createLocalBump(this.id, ownerId))
      await Promise.all(promises)

      return
    }

    let currentTime = new Date().getTime()
    await dbAdapter.setPostUpdatedAt(this.id, currentTime)

    let promises = timelineOwnersIds.map(async (ownerId)=> {
      const feedOwner = await dbAdapter.getFeedOwnerById(ownerId)
      return feedOwner.updateLastActivityAt()
    })
    await Promise.all(promises)
  }

  Post.prototype.getOmittedComments = async function() {
    let length = this.commentsCount
    if (length == null) {
      length = await dbAdapter.getPostCommentsCount(this.id)
    }

    if (length > this.maxComments && length > 3 && this.maxComments != 'all') {
      this.omittedComments = length - this.maxComments
      return this.omittedComments
    }

    return 0
  }

  Post.prototype.getPostComments = async function() {
    const comments = await dbAdapter.getAllPostCommentsWithoutBannedUsers(this.id, this.currentUser)
    const commentsIds = comments.map((cmt)=>{
      return cmt.id
    })

    const length = comments.length
    let visibleCommentsIds = commentsIds
    let visibleComments = comments
    if (length > this.maxComments && length > 3 && this.maxComments != 'all') {
      let firstNCommentIds = commentsIds.slice(0, this.maxComments - 1)
      let firstNComments   = comments.slice(0, this.maxComments - 1)
      let lastCommentId = _.last(commentsIds)
      let lastComment   = _.last(comments)

      this.omittedComments = length - this.maxComments
      visibleCommentsIds = firstNCommentIds.concat(lastCommentId)
      visibleComments = firstNComments.concat(lastComment)
    }

    this.commentIds = visibleCommentsIds
    return visibleComments
  }

  Post.prototype.getComments = async function() {
    this.comments = await this.getPostComments()

    return this.comments
  }

  Post.prototype.linkAttachments = async function(attachmentList) {
    const attachmentIds = attachmentList || this.attachments || []
    const attachments = await dbAdapter.getAttachmentsByIds(attachmentIds)

    const attachmentPromises = attachments.filter((attachment) => {
      // Filter out invalid attachments
      return attachment.fileSize !== undefined
    }).map((attachment) => {
      if (this.attachments) {
        const pos = this.attachments.indexOf(attachment.id)

        if (pos < 0) {
          this.attachments.push(attachment)
        } else {
          this.attachments[pos] = attachment
        }
      }

      // Update connections in DB

      return dbAdapter.linkAttachmentToPost(attachment.id, this.id)
    })

    await Promise.all(attachmentPromises)
  }

  Post.prototype.unlinkAttachments = async function(attachmentList) {
    const attachmentIds = attachmentList || []
    const attachments = await dbAdapter.getAttachmentsByIds(attachmentIds)

    const attachmentPromises = attachments.map((attachment) => {
      // should we modify `this.attachments` here?

      // Update connections in DB
      return dbAdapter.unlinkAttachmentFromPost(attachment.id, this.id)
    })

    await Promise.all(attachmentPromises)
  }

  Post.prototype.getAttachmentIds = async function() {
    this.attachmentIds = await dbAdapter.getPostAttachments(this.id)
    return this.attachmentIds
  }

  Post.prototype.getAttachments = async function() {
    this.attachments = await dbAdapter.getAttachmentsOfPost(this.id)

    return this.attachments
  }

  Post.prototype.getLikeIds = async function() {
    const omittedLikesCount = await this.getOmittedLikes()
    let likedUsersIds = await dbAdapter.getPostLikersIdsWithoutBannedUsers(this.id, this.currentUser)

    likedUsersIds = likedUsersIds.sort((a, b) => {
      if (a == this.currentUser)
        return -1

      if (b == this.currentUser)
        return 1

      return 0
    })
    likedUsersIds.splice(likedUsersIds.length - omittedLikesCount, omittedLikesCount)
    return likedUsersIds
  }

  Post.prototype.getOmittedLikes = async function() {
    let length = this.likesCount
    if (length == null) {
      length = await dbAdapter.getPostLikesCount(this.id)
    }

    if (this.maxLikes !== 'all') {
      const threshold = this.maxLikes + 1

      if (length > threshold) {
        return length - this.maxLikes
      }
    }

    return 0
  }

  Post.prototype.getLikes = async function() {
    let userIds = await this.getLikeIds()

    let users = await dbAdapter.getUsersByIds(userIds)

    // filter non-existant likers
    this.likes = users.filter(Boolean)

    return this.likes
  }

  Post.prototype.isPrivate = async function() {
    var timelines = await this.getPostedTo()

    var arr = timelines.map(async (timeline) => {
      if (timeline.isDirects())
        return true

      let owner = await dbAdapter.getUserById(timeline.userId)

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
    let relevantPostState = await dbAdapter.getPostById(this.id)
    this.feedIntIds = relevantPostState.feedIntIds
    this.destinationFeedIds = relevantPostState.destinationFeedIds

    var timer = monitor.timer('posts.likes.time')
    let timelineIntIds = this.destinationFeedIds.slice()

    // only subscribers are allowed to read direct posts
    if (!await this.isStrictlyDirect()) {
      let moreTimelineIntIds = await this.getLikesFriendOfFriendTimelineIntIds(user)
      timelineIntIds.push(...moreTimelineIntIds)

      timelineIntIds = _.uniq(timelineIntIds)
    }

    let timelines = await dbAdapter.getTimelinesByIntIds(timelineIntIds)

    // no need to post updates to rivers of banned users
    let bannedIds = await user.getBanIds()
    timelines = timelines.filter((timeline) => !(timeline.userId in bannedIds))

    await this.publishChangesToFeeds(timelines, true)

    await dbAdapter.createUserPostLike(this.id, user.id)

    timer.stop()
    monitor.increment('posts.likes')
    monitor.increment('posts.reactions')

    return timelines
  }

  Post.prototype.removeLike = async function(userId) {
    let user = await dbAdapter.getUserById(userId)
    var timer = monitor.timer('posts.unlikes.time')
    let timelineId = await user.getLikesTimelineIntId()
    let promises = [
      dbAdapter.removeUserPostLike(this.id, userId),
      dbAdapter.withdrawPostFromFeeds([timelineId], this.id)
    ]
    await Promise.all(promises)
    await pubSub.removeLike(this.id, userId)

    timer.stop()
    monitor.increment('posts.unlikes')
    monitor.increment('posts.unreactions')

    return true
  }

  Post.prototype.isBannedFor = async function(userId) {
    const user = await dbAdapter.getUserById(userId)
    const banIds = await user.getBanIds()

    const index = banIds.indexOf(this.userId)
    return index >= 0
  }

  Post.prototype.isHiddenIn = async function(timeline) {
    // hides are applicable only to river
    if (!(timeline.isRiverOfNews() || timeline.isHides()))
      return false

    let owner = await timeline.getUser()
    let hidesTimelineIntId = await owner.getHidesTimelineIntId()

    return dbAdapter.isPostPresentInTimeline(hidesTimelineIntId, this.id)
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

    return _.reduce(arr, function (acc, x) { return acc || x }, false)
  }

  return Post
}
