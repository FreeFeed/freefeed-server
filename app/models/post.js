import GraphemeBreaker from 'grapheme-breaker'
import _ from 'lodash'
import twitter from 'twitter-text'

import { Timeline, PubSub as pubSub } from '../models'


export function addModel(dbAdapter) {
  /**
   * @constructor
   */
  const Post = function (params) {
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
    this.isPrivate        = params.isPrivate || '0';
    this.isProtected      = params.isProtected || '0';

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
  Post.namespace = 'post'

  Reflect.defineProperty(Post.prototype, 'body', {
    get: function () { return this.body_ },
    set: function (newValue) {
      newValue ? this.body_ = newValue.trim() : this.body_ = ''
    }
  })

  Post.prototype.validate = async function () {
    const valid = this.body
               && this.body.length > 0
               && this.userId
               && this.userId.length > 0

    if (!valid) {
      throw new Error('Post text must not be empty')
    }

    const len = GraphemeBreaker.countBreaks(this.body)

    if (len > 1500) {
      throw new Error('Maximum post-length is 1500 graphemes')
    }
  }

  Post.prototype.create = async function () {
    this.createdAt = new Date().getTime()
    this.updatedAt = new Date().getTime()

    await this.validate()

    const payload = {
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

    const newPost = await dbAdapter.getPostById(this.id);
    this.isPrivate = newPost.isPrivate;
    this.isProtected = newPost.isProtected;

    // save nested resources
    await this.linkAttachments()
    await this.processHashtagsOnCreate()

    await Timeline.publishPost(this)

    await dbAdapter.statsPostCreated(this.userId)

    return this
  }

  Post.prototype.update = async function (params) {
    // Reflect post changes and validate
    this.updatedAt = new Date().getTime()
    this.body = params.body
    await this.validate()

    // Calculate changes in attachments
    const oldAttachments = await this.getAttachmentIds() || []
    const newAttachments = params.attachments || []
    const addedAttachments = newAttachments.filter((i) => !oldAttachments.includes(i))
    const removedAttachments = oldAttachments.filter((i) => !newAttachments.includes(i))

    // Update post body in DB
    const payload = {
      'body':      this.body,
      'updatedAt': this.updatedAt.toString()
    }
    await dbAdapter.updatePost(this.id, payload)

    // Update post attachments in DB
    await Promise.all([
      this.linkAttachments(addedAttachments),
      this.unlinkAttachments(removedAttachments)
    ])

    await this.processHashtagsOnUpdate()

    // Finally, publish changes
    await pubSub.updatePost(this.id)

    return this
  }

  Post.prototype.setCommentsDisabled = async function (newValue) {
    // Reflect post changes
    this.commentsDisabled = newValue

    // Update post body in DB
    const payload = { 'commentsDisabled': this.commentsDisabled }
    await dbAdapter.updatePost(this.id, payload)

    // Finally, publish changes
    await pubSub.updatePost(this.id)

    return this
  }

  Post.prototype.destroy = async function () {
    await dbAdapter.statsPostDeleted(this.userId, this.id)  // needs data in DB

// remove all comments
    const comments = await this.getComments()
    await Promise.all(comments.map((comment) => comment.destroy()))

    const timelineIds = await this.getTimelineIds()
    await dbAdapter.withdrawPostFromFeeds(this.feedIntIds, this.id)
    await dbAdapter.deletePost(this.id)

    await pubSub.destroyPost(this.id, timelineIds)
  }

  Post.prototype.getCreatedBy = function () {
    return dbAdapter.getUserById(this.userId)
  }

  Post.prototype.getSubscribedTimelineIds = async function (groupOnly) {
    if (typeof groupOnly === 'undefined')
      groupOnly = false

    const feed = await dbAdapter.getFeedOwnerById(this.userId)

    const feeds = [feed.getRiverOfNewsTimelineId()]
    if (!groupOnly)
      feeds.push(feed.getPostsTimelineId())

    let timelineIds = await Promise.all(feeds)
    const newTimelineIds = await this.getTimelineIds()

    timelineIds = timelineIds.concat(newTimelineIds)
    return _.uniq(timelineIds)
  }

  Post.prototype.getSubscribedTimelines = async function () {
    const timelineIds = await this.getSubscribedTimelineIds()
    this.subscribedTimelines = await dbAdapter.getTimelinesByIds(timelineIds)

    return this.subscribedTimelines
  }

  Post.prototype.getTimelineIds = async function () {
    const timelineIds = await dbAdapter.getPostUsagesInTimelines(this.id)
    this.timelineIds = timelineIds || []
    return this.timelineIds
  }

  Post.prototype.getTimelines = async function () {
    this.timelines = await dbAdapter.getTimelinesByIntIds(this.feedIntIds)

    return this.timelines
  }

  Post.prototype.getPostedToIds = async function () {
    const timelineIds = await dbAdapter.getTimelinesUUIDsByIntIds(this.destinationFeedIds)
    this.timelineIds = timelineIds || []
    return this.timelineIds
  }

  Post.prototype.getPostedTo = async function () {
    this.postedTo = await dbAdapter.getTimelinesByIntIds(this.destinationFeedIds)

    return this.postedTo
  }

  Post.prototype.getGenericFriendOfFriendTimelineIntIds = async function (user, type) {
    const timelineIntIds = []

    const userTimelineIntId = await user[`get${type}TimelineIntId`]()
    timelineIntIds.push(userTimelineIntId)

    const timelines = await dbAdapter.getTimelinesByIntIds(this.destinationFeedIds)
    const timelineOwners = await dbAdapter.getFeedOwnersByIds(timelines.map((tl) => tl.userId))

    // Adds the specified post to River of News if and only if
    // that post has been published to user's Post timeline,
    // otherwise this post will stay in group(s) timelines
    let groupOnly = true

    if (_.some(timelineOwners.map((owner) => owner.isUser()))) {
      groupOnly = false

      const timeline = await dbAdapter.getTimelineByIntId(userTimelineIntId)
      const subscribersIds = await timeline.getSubscriberIds()
      const subscribersRiversOfNewsIntIds = await dbAdapter.getUsersNamedFeedsIntIds(subscribersIds, ['RiverOfNews'])
      timelineIntIds.push(subscribersRiversOfNewsIntIds)
    }

    const postAuthor = await dbAdapter.getFeedOwnerById(this.userId)
    timelineIntIds.push(await postAuthor.getRiverOfNewsTimelineIntId())

    if (!groupOnly) {
      timelineIntIds.push(await postAuthor.getPostsTimelineIntId())
    }

    timelineIntIds.push(await user.getRiverOfNewsTimelineIntId())
    timelineIntIds.push(this.feedIntIds)

    return _.uniq(_.flatten(timelineIntIds))
  }

  Post.prototype.getLikesFriendOfFriendTimelineIntIds = function (user) {
    return this.getGenericFriendOfFriendTimelineIntIds(user, 'Likes')
  }

  Post.prototype.getCommentsFriendOfFriendTimelineIntIds = function (user) {
    return this.getGenericFriendOfFriendTimelineIntIds(user, 'Comments')
  }

  Post.prototype.hide = async function (userId) {
    const theUser = await dbAdapter.getUserById(userId)
    const hidesTimelineId = await theUser.getHidesTimelineIntId()

    await dbAdapter.insertPostIntoFeeds([hidesTimelineId], this.id)

    await pubSub.hidePost(theUser.id, this.id)
  }

  Post.prototype.unhide = async function (userId) {
    const theUser = await dbAdapter.getUserById(userId)
    const hidesTimelineId = await theUser.getHidesTimelineIntId()

    await dbAdapter.withdrawPostFromFeeds([hidesTimelineId], this.id)

    await pubSub.unhidePost(theUser.id, this.id)
  }

  Post.prototype.addComment = async function (comment) {
    const user = await dbAdapter.getUserById(comment.userId)

    let timelineIntIds = this.destinationFeedIds.slice()

    // only subscribers are allowed to read direct posts
    if (!await this.isStrictlyDirect()) {
      const moreTimelineIntIds = await this.getCommentsFriendOfFriendTimelineIntIds(user)
      timelineIntIds.push(...moreTimelineIntIds)

      timelineIntIds = _.uniq(timelineIntIds)
    }

    let timelines = await dbAdapter.getTimelinesByIntIds(timelineIntIds)

    // no need to post updates to rivers of banned users
    const bannedIds = await user.getBanIds()
    timelines = timelines.filter((timeline) => !(timeline.userId in bannedIds))

    await this.publishChangesToFeeds(timelines, false)

    return timelines
  }

  Post.prototype.publishChangesToFeeds = async function (timelines, isLikeAction = false) {
    const feedsIntIds = timelines.map((t) => t.intId)
    const insertIntoFeedIds = _.difference(feedsIntIds, this.feedIntIds)
    const timelineOwnersIds = timelines.map((t) => t.userId)
    let riversOfNewsOwners = timelines.map((t) => {
      if (t.isRiverOfNews() && insertIntoFeedIds.includes(t.intId)) {
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

      const promises = riversOfNewsOwners.map((ownerId) => dbAdapter.createLocalBump(this.id, ownerId))
      await Promise.all(promises)

      return
    }

    const now = new Date();

    const promises = [
      dbAdapter.setPostUpdatedAt(this.id, now.getTime()),
      dbAdapter.setUpdatedAtInGroupsByIds(timelineOwnersIds, now.getTime())
    ];

    await Promise.all(promises);
  }

  Post.prototype.getOmittedComments = async function () {
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

  Post.prototype.getPostComments = async function () {
    const comments = await dbAdapter.getAllPostCommentsWithoutBannedUsers(this.id, this.currentUser)
    const commentsIds = comments.map((cmt) => {
      return cmt.id
    })

    const length = comments.length
    let visibleCommentsIds = commentsIds
    let visibleComments = comments
    if (length > this.maxComments && length > 3 && this.maxComments != 'all') {
      const firstNCommentIds = commentsIds.slice(0, this.maxComments - 1)
      const firstNComments   = comments.slice(0, this.maxComments - 1)
      const lastCommentId = _.last(commentsIds)
      const lastComment   = _.last(comments)

      this.omittedComments = length - this.maxComments
      visibleCommentsIds = firstNCommentIds.concat(lastCommentId)
      visibleComments = firstNComments.concat(lastComment)
    }

    this.commentIds = visibleCommentsIds
    return visibleComments
  }

  Post.prototype.getComments = async function () {
    this.comments = await this.getPostComments()

    return this.comments
  }

  Post.prototype.linkAttachments = async function (attachmentList) {
    const attachmentIds = attachmentList || this.attachments || []
    const attachments = await dbAdapter.getAttachmentsByIds(attachmentIds)

    const attachmentPromises = attachments.filter((attachment) => {
      // Filter out invalid attachments
      return attachment.fileSize !== undefined
    }).map((attachment) => {
      if (this.attachments) {
        const pos = this.attachments.indexOf(attachment.id)

        if (pos === -1) {
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

  Post.prototype.unlinkAttachments = async function (attachmentList) {
    const attachmentIds = attachmentList || []
    const attachments = await dbAdapter.getAttachmentsByIds(attachmentIds)

    const attachmentPromises = attachments.map((attachment) => {
      // should we modify `this.attachments` here?

      // Update connections in DB
      return dbAdapter.unlinkAttachmentFromPost(attachment.id, this.id)
    })

    await Promise.all(attachmentPromises)
  }

  Post.prototype.getAttachmentIds = async function () {
    this.attachmentIds = await dbAdapter.getPostAttachments(this.id)
    return this.attachmentIds
  }

  Post.prototype.getAttachments = async function () {
    this.attachments = await dbAdapter.getAttachmentsOfPost(this.id)

    return this.attachments
  }

  Post.prototype.getLikeIds = async function () {
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

  Post.prototype.getOmittedLikes = async function () {
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

  Post.prototype.getLikes = async function () {
    const userIds = await this.getLikeIds()

    const users = await dbAdapter.getUsersByIds(userIds)

    // filter non-existant likers
    this.likes = users.filter(Boolean)

    return this.likes
  }

  Post.prototype.isPrivate = async function () {
    const timelines = await this.getPostedTo()

    const arr = timelines.map(async (timeline) => {
      if (timeline.isDirects())
        return true

      const owner = await dbAdapter.getUserById(timeline.userId)

      return (owner.isPrivate === '1')
    })

    // one public timeline is enough
    return _.every(await Promise.all(arr))
  }

  Post.prototype.isStrictlyDirect = async function () {
    const timelines = await this.getPostedTo()
    const flags = timelines.map((timeline) => timeline.isDirects())

    // one non-direct timeline is enough
    return _.every(flags)
  }

  Post.prototype.addLike = async function (user) {
    const relevantPostState = await dbAdapter.getPostById(this.id)
    this.feedIntIds = relevantPostState.feedIntIds
    this.destinationFeedIds = relevantPostState.destinationFeedIds

    let timelineIntIds = this.destinationFeedIds.slice()

    // only subscribers are allowed to read direct posts
    if (!await this.isStrictlyDirect()) {
      const moreTimelineIntIds = await this.getLikesFriendOfFriendTimelineIntIds(user)
      timelineIntIds.push(...moreTimelineIntIds)

      timelineIntIds = _.uniq(timelineIntIds)
    }

    let timelines = await dbAdapter.getTimelinesByIntIds(timelineIntIds)

    // no need to post updates to rivers of banned users
    const bannedIds = await user.getBanIds()
    timelines = timelines.filter((timeline) => !(timeline.userId in bannedIds))

    await dbAdapter.createUserPostLike(this.id, user.id)
    await this.publishChangesToFeeds(timelines, true)

    return timelines
  }

  Post.prototype.removeLike = async function (userId) {
    const user = await dbAdapter.getUserById(userId)
    const timelineId = await user.getLikesTimelineIntId()
    const promises = [
      dbAdapter.removeUserPostLike(this.id, userId),
      dbAdapter.withdrawPostFromFeeds([timelineId], this.id)
    ]
    await Promise.all(promises)
    await pubSub.removeLike(this.id, userId)

    return true
  }

  Post.prototype.isBannedFor = async function (userId) {
    const user = await dbAdapter.getUserById(userId)
    const banIds = await user.getBanIds()

    return banIds.includes(this.userId)
  }

  Post.prototype.isHiddenIn = async function (timeline) {
    // hides are applicable only to river
    if (!(timeline.isRiverOfNews() || timeline.isHides()))
      return false

    const owner = await timeline.getUser()
    const hidesTimelineIntId = await owner.getHidesTimelineIntId()

    return dbAdapter.isPostPresentInTimeline(hidesTimelineIntId, this.id)
  }

  Post.prototype.canShow = async function (readerId, checkOnlyDestinations = true) {
    let timelines = await (checkOnlyDestinations ? this.getPostedTo() : this.getTimelines());

    if (!checkOnlyDestinations) {
      timelines = timelines.filter((timeline) => timeline.isPosts() || timeline.isDirects());
    }

    if (timelines.map((timeline) => timeline.userId).includes(readerId)) {
      // one of the timelines belongs to the user
      return true;
    }

    // skipping someone else's directs
    const nonDirectTimelines = timelines.filter((timeline) => !timeline.isDirects());

    if (nonDirectTimelines.length === 0) {
      return false;
    }

    const ownerIds = nonDirectTimelines.map((timeline) => timeline.userId);
    if (await dbAdapter.someUsersArePublic(ownerIds, !readerId)) {
      return true;
    }

    if (!readerId) {
      // no public feeds. anonymous can't see
      return false;
    }

    const timelineIds = nonDirectTimelines.map((timeline) => timeline.id);
    return await dbAdapter.isUserSubscribedToOneOfTimelines(readerId, timelineIds);
  };

  Post.prototype.processHashtagsOnCreate = async function () {
    const postTags = _.uniq(twitter.extractHashtags(this.body.toLowerCase()))

    if (!postTags || postTags.length == 0) {
      return
    }
    await dbAdapter.linkPostHashtagsByNames(postTags, this.id)
  }

  Post.prototype.processHashtagsOnUpdate = async function () {
    const linkedPostHashtags = await dbAdapter.getPostHashtags(this.id)

    const presentTags    = _.sortBy(linkedPostHashtags.map((t) => t.name))
    const newTags        = _.sortBy(_.uniq(twitter.extractHashtags(this.body.toLowerCase())))
    const notChangedTags = _.intersection(presentTags, newTags)
    const tagsToUnlink   = _.difference(presentTags, notChangedTags)
    const tagsToLink     = _.difference(newTags, notChangedTags)

    if (presentTags != newTags) {
      if (tagsToUnlink.length > 0) {
        await dbAdapter.unlinkPostHashtagsByNames(tagsToUnlink, this.id)
      }
      if (tagsToLink.length > 0) {
        await dbAdapter.linkPostHashtagsByNames(tagsToLink, this.id)
      }
    }
  }

  return Post
}
