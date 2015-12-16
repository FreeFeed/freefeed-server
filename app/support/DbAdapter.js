"use strict";

import modelsSupport from '../support/models'
const mkKey = modelsSupport.mkKey

export class DbAdapter{
  constructor(database) {
    this.database = database
  }

  ///////////////////////////////////////////////////
  // User
  ///////////////////////////////////////////////////

  async setUserPassword(userId, updatedAt, hashedPassword) {
    return this.database.hmsetAsync(mkKey(['user', userId]),
      {
        'updatedAt':      updatedAt.toString(),
        'hashedPassword': hashedPassword
      })
  }

  async createUser(userId, payload) {
    return this.database.hmsetAsync(mkKey(['user', userId]), payload)
  }

  async updateUser(userId, payload) {
    return this.database.hmsetAsync(mkKey(['user', userId]), payload)
  }

  async existsUser(userId) {
    return this.database.existsAsync(mkKey(['user', userId]))
  }

  async getUserById(userId) {
    return this.database.hgetallAsync(mkKey(['user', userId]))
  }

  async getUsersByIds(userIds) {
    let keys     = userIds.map(id => mkKey(['user', id]))
    let requests = keys.map(key => ['hgetall', key])

    return this.database.batch(requests).execAsync()
  }

  ///////////

  async getUserTimelinesIds(userId) {
    return this.database.hgetallAsync(mkKey(['user', userId, 'timelines']))
  }

  async createUserTimeline(userId, timelineName, timelineId) {
    return this.database.hmsetAsync(mkKey(['user', userId, 'timelines']), timelineName, timelineId)
  }


  ///////////////////////////////////////////////////
  // Post
  ///////////////////////////////////////////////////

  async createPost(postId, payload) {
    return this.database.hmsetAsync(mkKey(['post', postId]), payload)
  }

  async updatePost(postId, payload) {
    return this.database.hmsetAsync(mkKey(['post', postId]), payload)
  }

  async setPostUpdatedAt(postId, time) {
    return this.database.hsetAsync(mkKey(['post', postId]), 'updatedAt', time)
  }

  async deletePost(postId) {
    return this.database.delAsync(mkKey(['post', postId]))
  }

  ///////////

  async createUserPostLike(postId, likedTime, userId) {
    return this.database.zaddAsync(mkKey(['post', postId, 'likes']), likedTime, userId)
  }

  async getPostLikesCount(postId) {
    return this.database.zcardAsync(mkKey(['post', postId, 'likes']))
  }

  async getPostLikesRange(postId, fromIndex, toIndex) {
    return this.database.zrevrangeAsync(mkKey(['post', postId, 'likes']), fromIndex, toIndex)
  }

  async getUserPostLikedTime(userId, postId) {
    return this.database.zscoreAsync(mkKey(['post', postId, 'likes']), userId)
  }

  async removeUserPostLike(postId, userId) {
    return this.database.zremAsync(mkKey(['post', postId, 'likes']), userId)
  }

  async deletePostLikes(postId) {
    return this.database.delAsync(mkKey(['post', postId, 'likes']))
  }

  ///////////

  async createPostUsageInTimeline(postId, timelineId) {
    return this.database.saddAsync(mkKey(['post', postId, 'timelines']), timelineId)
  }

  async getPostUsagesInTimelinesCount(postId) {
    return this.database.scardAsync(mkKey(['post', postId, 'timelines']))
  }

  async getPostUsagesInTimelines(postId) {
    return this.database.smembersAsync(mkKey(['post', postId, 'timelines']))
  }

  async deletePostUsageInTimeline(postId, timelineId) {
    return this.database.sremAsync(mkKey(['post', postId, 'timelines']), timelineId)
  }

  async deletePostUsagesInTimelineIndex(postId) {
    return this.database.delAsync(mkKey(['post', postId, 'timelines']))
  }

  ///////////

  async getPostPostedToIds(postId) {
    return this.database.smembersAsync(mkKey(['post', postId, 'to']))
  }

  async createPostPostedTo(postId, timelineIds) {
    return this.database.saddAsync(mkKey(['post', postId, 'to']), timelineIds)
  }

  async deletePostPostedTo(postId) {
    return this.database.delAsync(mkKey(['post', postId, 'to']))
  }

  ///////////

  async getPostCommentsCount(postId) {
    return this.database.llenAsync(mkKey(['post', postId, 'comments']))
  }

  async removeCommentFromPost(postId, commentId) {
    return this.database.lremAsync(mkKey(['post', postId, 'comments']), 1, commentId)
  }

  async getPostCommentsRange(postId, fromIndex, toIndex) {
    return this.database.lrangeAsync(mkKey(['post', postId, 'comments']), fromIndex, toIndex)
  }

  async addCommentToPost(postId, commentId) {
    return this.database.rpushAsync(mkKey(['post', postId, 'comments']), commentId)
  }

  async deletePostComments(postId) {
    return this.database.delAsync(mkKey(['post', postId, 'comments']))
  }

  ///////////

  async getPostAttachments(postId) {
    return this.database.lrangeAsync(mkKey(['post', postId, 'attachments']), 0, -1)
  }

  async addAttachmentToPost(postId, attachmentId) {
    return this.database.rpushAsync(mkKey(['post', postId, 'attachments']), attachmentId)
  }

  async removeAttachmentsFromPost(postId, attachmentId) {
    return this.database.lremAsync(mkKey(['post', postId, 'attachments']), 0, attachmentId)
  }


  ///////////////////////////////////////////////////
  // Reset password tokens
  ///////////////////////////////////////////////////

  async createUserResetPasswordToken(userId, token) {
    return this.database.setAsync(mkKey(['reset', token, 'uid']), userId)
  }

  async setUserResetPasswordTokenExpireAfter(token, expireAfter) {
    return this.database.expireAsync(mkKey(['reset', token, 'uid']), expireAfter)
  }

  async deleteUserResetPasswordToken(token) {
    return this.database.delAsync(mkKey(['reset', token, 'uid']))
  }

  ///////////////////////////////////////////////////
  // Subscription requests
  ///////////////////////////////////////////////////

  async getUserSubscriptionRequestsIds(currentUserId) {
    return this.database.zrevrangeAsync(mkKey(['user', currentUserId, 'requests']), 0, -1)
  }

  async getUserSubscriptionRequestTime(currentUserId, followedUserId) {
    return this.database.zscoreAsync(mkKey(['user', followedUserId, 'requests']), currentUserId)
  }

  async createUserSubscriptionRequest(currentUserId, currentTime, followedUserId) {
    return this.database.zaddAsync(mkKey(['user', followedUserId, 'requests']), currentTime, currentUserId)
  }

  async deleteUserSubscriptionRequest(currentUserId, followerUserId) {
    return this.database.zremAsync(mkKey(['user', currentUserId, 'requests']), followerUserId)
  }

  ///////////////////////////////////////////////////
  // Pending (sent) requests
  ///////////////////////////////////////////////////

  async getUserSubscriptionPendingRequestsIds(currentUserId) {
    return this.database.zrevrangeAsync(mkKey(['user', currentUserId, 'pending']), 0, -1)
  }

  async createUserSubscriptionPendingRequest(currentUserId, currentTime, followedUserId) {
    return this.database.zaddAsync(mkKey(['user', currentUserId, 'pending']), currentTime, followedUserId)
  }

  async deleteUserSubscriptionPendingRequest(currentUserId, followerUserId) {
    return this.database.zremAsync(mkKey(['user', followerUserId, 'pending']), currentUserId)
  }

  ///////////////////////////////////////////////////
  // Subscriptions
  ///////////////////////////////////////////////////

  async getUserSubscriptionsIds(userId) {
    return this.database.zrevrangeAsync(mkKey(['user', userId, 'subscriptions']), 0, -1)
  }

  async createUserSubscription(currentUserId, currentTime, timelineId) {
    return this.database.zaddAsync(mkKey(['user', currentUserId, 'subscriptions']), currentTime, timelineId)
  }

  async deleteUserSubscription(currentUserId, timelineId) {
    return this.database.zremAsync(mkKey(['user', currentUserId, 'subscriptions']), timelineId)
  }

  ///////////////////////////////////////////////////
  // Bans
  ///////////////////////////////////////////////////

  async getUserBansIds(userId) {
    return this.database.zrevrangeAsync(mkKey(['user', userId, 'bans']), 0, -1)
  }

  async createUserBan(currentUserId, currentTime, bannedUserId) {
    return this.database.zaddAsync(mkKey(['user', currentUserId, 'bans']), currentTime, bannedUserId)
  }

  async deleteUserBan(currentUserId, bannedUserId) {
    return this.database.zremAsync(mkKey(['user', currentUserId, 'bans']), bannedUserId)
  }

  ///////////////////////////////////////////////////
  // User indexes
  ///////////////////////////////////////////////////

  async getUserIdByUsername(username) {
    return this.database.getAsync(mkKey(['username', username, 'uid']))
  }

  async createUserUsernameIndex(userId, username) {
    return this.database.setAsync(mkKey(['username', username, 'uid']), userId)
  }

  async getUserIdByEmail(email) {
    return this.database.getAsync(mkKey(['email', this._normalizeUserEmail(email), 'uid']))
  }

  async createUserEmailIndex(userId, email) {
    return this.database.setAsync(mkKey(['email', this._normalizeUserEmail(email), 'uid']), userId)
  }

  async dropUserEmailIndex(email) {
    return this.database.delAsync(mkKey(['email', this._normalizeUserEmail(email), 'uid']))
  }

  ///////////////////////////////////////////////////
  // Group administrators
  ///////////////////////////////////////////////////

  async getGroupAdministratorsIds(groupId) {
    return this.database.zrevrangeAsync(mkKey(['user', groupId, 'administrators']), 0, -1)
  }

  async addAdministratorToGroup(groupId, currentTime, adminId) {
    return this.database.zaddAsync(mkKey(['user', groupId, 'administrators']), currentTime, adminId)
  }

  async removeAdministratorFromGroup(groupId, adminId) {
    return this.database.zremAsync(mkKey(['user', groupId, 'administrators']), adminId)
  }

  ///////////////////////////////////////////////////
  // Timelines
  ///////////////////////////////////////////////////

  async createTimeline(timelineId, payload) {
    return this.database.hmsetAsync(mkKey(['timeline', timelineId]), payload)
  }

  async addPostToTimeline(timelineId, time, postId) {
    return this.database.zaddAsync(mkKey(['timeline', timelineId, 'posts']), time, postId)
  }

  async getTimelinePostTime(timelineId, postId) {
    return this.database.zscoreAsync(mkKey(['timeline', timelineId, 'posts']), postId)
  }

  async getTimelinePostsCount(timelineId) {
    return this.database.zcardAsync(mkKey(['timeline', timelineId, 'posts']))
  }

  async getTimelinePostsRange(timelineId, startIndex, finishIndex) {
    return this.database.zrevrangeAsync(mkKey(['timeline', timelineId, 'posts']), startIndex, finishIndex)
  }

  async getTimelinePostsInTimeInterval(timelineId, timeIntervalStart, timeIntervalEnd) {
    return this.database.zrevrangebyscoreAsync(mkKey(['timeline', timelineId, 'posts']), timeIntervalStart, timeIntervalEnd)
  }

  async removePostFromTimeline(timelineId, postId) {
    return this.database.zremAsync(mkKey(['timeline', timelineId, 'posts']), postId)
  }

  async createMergedPostsTimeline(destinationTimelineId, sourceTimelineId1, sourceTimelineId2) {
    return this.database.zunionstoreAsync(
      mkKey(['timeline', destinationTimelineId, 'posts']), 2,
      mkKey(['timeline', sourceTimelineId1, 'posts']),
      mkKey(['timeline', sourceTimelineId2, 'posts']),
      'AGGREGATE', 'MAX'
    )
  }

  async getPostsTimelinesIntersection(destKey, sourceTimelineId1, sourceTimelineId2) {
    return this.database.zinterstoreAsync(
      destKey, 2,
      mkKey(['timeline', sourceTimelineId1, 'posts']),
      mkKey(['timeline', sourceTimelineId2, 'posts']),
      'AGGREGATE', 'MAX'
    )
  }

  async getTimelineSubscribers(timelineId) {
    return this.database.zrevrangeAsync(mkKey(['timeline', timelineId, 'subscribers']), 0, -1)
  }

  async addTimelineSubscriber(timelineId, currentTime, currentUserId) {
    return this.database.zaddAsync(mkKey(['timeline', timelineId, 'subscribers']), currentTime, currentUserId)
  }

  async removeTimelineSubscriber(timelineId, currentUserId) {
    return this.database.zremAsync(mkKey(['timeline', timelineId, 'subscribers']), currentUserId)
  }

  ///////////////////////////////////////////////////
  // Stats
  ///////////////////////////////////////////////////

  async updateUserStats(userId, payload) {
    return this.database.hmsetAsync(mkKey(['stats', userId]), payload)
  }

  async addUserLikesStats(userId, likes) {
    return this.database.zaddAsync(mkKey(['stats', 'likes']), likes, userId)
  }

  async addUserPostsStats(userId, posts) {
    return this.database.zaddAsync(mkKey(['stats', 'posts']), posts, userId)
  }

  async addUserCommentsStats(userId, comments) {
    return this.database.zaddAsync(mkKey(['stats', 'comments']), comments, userId)
  }

  async addUserSubscribersStats(userId, subscribers) {
    return this.database.zaddAsync(mkKey(['stats', 'subscribers']), subscribers, userId)
  }

  async addUserSubscriptionsStats(userId, subscriptions) {
    return this.database.zaddAsync(mkKey(['stats', 'subscriptions']), subscriptions, userId)
  }

  async changeUserStatsValue(userId, property, value) {
    return this.database.hincrbyAsync('stats:' + userId, property, value)
  }

  async changeUserStats(userId, property, value) {
    return this.database.zincrbyAsync(mkKey(['stats', property]), value, userId)
  }


  ///////////////////////////////////////////////////
  // Comments
  ///////////////////////////////////////////////////

  async createComment(commentId, payload) {
    return this.database.hmsetAsync(mkKey(['comment', commentId]), payload)
  }

  async updateComment(commentId, payload) {
    return this.database.hmsetAsync(mkKey(['comment', commentId]), payload)
  }

  async deleteComment(commentId) {
    return this.database.delAsync(mkKey(['comment', commentId]))
  }

  ///////////////////////////////////////////////////
  // Attachments
  ///////////////////////////////////////////////////

  async createAttachment(attachmentId, payload) {
    return this.database.hmsetAsync(mkKey(['attachment', attachmentId]), payload)
  }

  async setAttachmentPostId(attachmentId, postId) {
    return this.database.hsetAsync(mkKey(['attachment', attachmentId]), 'postId', postId)
  }

  ///////////////////////////////////////////////////
  // Timeline utils
  ///////////////////////////////////////////////////


  async getTimelinesIntersectionPosts(key) {
    return this.database.zrangeAsync(key, 0, -1)
  }

  async deleteRecord(key) {
    return this.database.delAsync(key)
  }

  ///////////////////////////////////////////////////
  // AbstractModel
  ///////////////////////////////////////////////////

  async findRecordById(modelName, modelId) {
    return this.database.hgetallAsync(mkKey([modelName, modelId]))
  }

  async findRecordsByIds(modelName, modelIds) {
    let keys     = modelIds.map(id => mkKey([modelName, id]))
    let requests = keys.map(key => ['hgetall', key])

    return this.database.batch(requests).execAsync()
  }

  async findUserByAttributeIndex(attribute, value) {
    return this.database.getAsync(mkKey([attribute, value, 'uid']))
  }

  async existsRecord(key) {
    return this.database.existsAsync(key)
  }


  _normalizeUserEmail(email){
    return email.toLowerCase()
  }
}