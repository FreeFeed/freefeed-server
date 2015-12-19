"use strict";

import {default as uuid} from 'uuid'
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
    let payload = {
      'updatedAt':      updatedAt.toString(),
      'hashedPassword': hashedPassword
    }
    return this.updateRecord(mkKey(['user', userId]), payload)
  }

  async createUser(userId, payload) {
    return this.createRecord(mkKey(['user', userId]), payload)
  }

  async updateUser(userId, payload) {
    return this.updateRecord(mkKey(['user', userId]), payload)
  }

  async existsUser(userId) {
    return this.existsRecord(mkKey(['user', userId]))
  }

  async getUserById(userId) {
    return this.getRecord(mkKey(['user', userId]))
  }

  async getUsersByIds(userIds) {
    let keys     = userIds.map(id => mkKey(['user', id]))
    let requests = keys.map(key => ['hgetall', key])

    return this.database.batch(requests).execAsync()
  }

  ///////////

  async getUserTimelinesIds(userId) {
    return this.getRecord(mkKey(['user', userId, 'timelines']))
  }

  async createUserTimeline(userId, timelineName, timelineId) {
    let payload = {}
    payload[timelineName] = timelineId
    return this.createRecord(mkKey(['user', userId, 'timelines']), payload)
  }


  ///////////////////////////////////////////////////
  // Post
  ///////////////////////////////////////////////////

  async createPost(payload) {
    let postId = uuid.v4()
    let key = mkKey(['post', postId])
    let exists = await this.existsRecord(key)

    if (exists !== 0){
      throw new Error("Already exists")
    }

    await this.createRecord(key, payload)
    return postId
  }

  async updatePost(postId, payload) {
    return this.updateRecord(mkKey(['post', postId]), payload)
  }

  async setPostUpdatedAt(postId, time) {
    let payload = {
      'updatedAt': time
    }
    return this.updateRecord(mkKey(['post', postId]), payload)
  }

  async deletePost(postId) {
    return this.deleteRecord(mkKey(['post', postId]))
  }

  ///////////

  async createUserPostLike(postId, userId) {
    let now = new Date().getTime()
    return this.addElementToSortedSet(mkKey(['post', postId, 'likes']), now, userId)
  }

  async getPostLikesCount(postId) {
    return this.getSortedSetElementsCount(mkKey(['post', postId, 'likes']))
  }

  async getPostLikesRange(postId, fromIndex, toIndex) {
    return this.getSortedSetElements(mkKey(['post', postId, 'likes']), fromIndex, toIndex)
  }

  async hasUserLikedPost(userId, postId) {
    let score = await this.getSortedSetElementScore(mkKey(['post', postId, 'likes']), userId)
    return score && score >= 0
  }

  async getUserPostLikedTime(userId, postId) {
    return this.getSortedSetElementScore(mkKey(['post', postId, 'likes']), userId)
  }

  async removeUserPostLike(postId, userId) {
    return this.removeElementFromSortedSet(mkKey(['post', postId, 'likes']), userId)
  }

  async deletePostLikes(postId) {
    return this.deleteRecord(mkKey(['post', postId, 'likes']))
  }

  ///////////

  async createPostUsageInTimeline(postId, timelineId) {
    return this.addElementToSet(mkKey(['post', postId, 'timelines']), timelineId)
  }

  async getPostUsagesInTimelinesCount(postId) {
    return this.getSetElementsCount(mkKey(['post', postId, 'timelines']))
  }

  async getPostUsagesInTimelines(postId) {
    return this.getSetElements(mkKey(['post', postId, 'timelines']))
  }

  async deletePostUsageInTimeline(postId, timelineId) {
    return this.removeElementFromSet(mkKey(['post', postId, 'timelines']), timelineId)
  }

  async deletePostUsagesInTimelineIndex(postId) {
    return this.deleteRecord(mkKey(['post', postId, 'timelines']))
  }

  ///////////

  async getPostPostedToIds(postId) {
    return this.getSetElements(mkKey(['post', postId, 'to']))
  }

  async createPostPostedTo(postId, timelineIds) {
    return this.addElementToSet(mkKey(['post', postId, 'to']), timelineIds)
  }

  async deletePostPostedTo(postId) {
    return this.deleteRecord(mkKey(['post', postId, 'to']))
  }

  ///////////

  async getPostCommentsCount(postId) {
    return this.getListElementsCount(mkKey(['post', postId, 'comments']))
  }

  async removeCommentFromPost(postId, commentId) {
    return this.removeOneElementFromList(mkKey(['post', postId, 'comments']), commentId)
  }

  async getPostCommentsRange(postId, fromIndex, toIndex) {
    return this.getListElementsRange(mkKey(['post', postId, 'comments']), fromIndex, toIndex)
  }

  async addCommentToPost(postId, commentId) {
    return this.addElementToList(mkKey(['post', postId, 'comments']), commentId)
  }

  async deletePostComments(postId) {
    return this.deleteRecord(mkKey(['post', postId, 'comments']))
  }

  ///////////

  async getPostAttachments(postId) {
    return this.getAllListElements(mkKey(['post', postId, 'attachments']))
  }

  async addAttachmentToPost(postId, attachmentId) {
    return this.addElementToList(mkKey(['post', postId, 'attachments']), attachmentId)
  }

  async removeAttachmentsFromPost(postId, attachmentId) {
    return this.removeAllElementsEqualToFromList(mkKey(['post', postId, 'attachments']), attachmentId)
  }


  ///////////////////////////////////////////////////
  // Reset password tokens
  ///////////////////////////////////////////////////

  async createUserResetPasswordToken(userId, token) {
    return this.setIndexValue(mkKey(['reset', token, 'uid']), userId)
  }

  async setUserResetPasswordTokenExpireAfter(token, expireAfter) {
    return this.database.expireAsync(mkKey(['reset', token, 'uid']), expireAfter)
  }

  async deleteUserResetPasswordToken(token) {
    return this.deleteRecord(mkKey(['reset', token, 'uid']))
  }

  ///////////////////////////////////////////////////
  // Subscription requests
  ///////////////////////////////////////////////////

  async getUserSubscriptionRequestsIds(currentUserId) {
    return this.getAllSortedSetElements(mkKey(['user', currentUserId, 'requests']))
  }

  async isSubscriptionRequestPresent(currentUserId, followedUserId) {
    let score = await this.getSortedSetElementScore(mkKey(['user', followedUserId, 'requests']), currentUserId)
    return score && score >= 0
  }

  async createUserSubscriptionRequest(currentUserId, currentTime, followedUserId) {
    return this.addElementToSortedSet(mkKey(['user', followedUserId, 'requests']), currentTime, currentUserId)
  }

  async deleteUserSubscriptionRequest(currentUserId, followerUserId) {
    return this.removeElementFromSortedSet(mkKey(['user', currentUserId, 'requests']), followerUserId)
  }

  ///////////////////////////////////////////////////
  // Pending (sent) requests
  ///////////////////////////////////////////////////

  async getUserSubscriptionPendingRequestsIds(currentUserId) {
    return this.getAllSortedSetElements(mkKey(['user', currentUserId, 'pending']))
  }

  async createUserSubscriptionPendingRequest(currentUserId, currentTime, followedUserId) {
    return this.addElementToSortedSet(mkKey(['user', currentUserId, 'pending']), currentTime, followedUserId)
  }

  async deleteUserSubscriptionPendingRequest(currentUserId, followerUserId) {
    return this.removeElementFromSortedSet(mkKey(['user', followerUserId, 'pending']), currentUserId)
  }

  ///////////////////////////////////////////////////
  // Subscriptions
  ///////////////////////////////////////////////////

  async getUserSubscriptionsIds(userId) {
    return this.getAllSortedSetElements(mkKey(['user', userId, 'subscriptions']))
  }

  async createUserSubscription(currentUserId, currentTime, timelineId) {
    return this.addElementToSortedSet(mkKey(['user', currentUserId, 'subscriptions']), currentTime, timelineId)
  }

  async deleteUserSubscription(currentUserId, timelineId) {
    return this.removeElementFromSortedSet(mkKey(['user', currentUserId, 'subscriptions']), timelineId)
  }

  ///////////////////////////////////////////////////
  // Bans
  ///////////////////////////////////////////////////

  async getUserBansIds(userId) {
    return this.getAllSortedSetElements(mkKey(['user', userId, 'bans']))
  }

  async createUserBan(currentUserId, bannedUserId) {
    let now = new Date().getTime()
    return this.addElementToSortedSet(mkKey(['user', currentUserId, 'bans']), now, bannedUserId)
  }

  async deleteUserBan(currentUserId, bannedUserId) {
    return this.removeElementFromSortedSet(mkKey(['user', currentUserId, 'bans']), bannedUserId)
  }

  ///////////////////////////////////////////////////
  // User indexes
  ///////////////////////////////////////////////////

  async existsUsername(username){
    return this.existsRecord(mkKey(['username', username, 'uid']))
  }

  async getUserIdByUsername(username) {
    return this.getIndexValue(mkKey(['username', username, 'uid']))
  }

  async createUserUsernameIndex(userId, username) {
    return this.setIndexValue(mkKey(['username', username, 'uid']), userId)
  }

  async getUserIdByEmail(email) {
    return this.getIndexValue(mkKey(['email', this._normalizeUserEmail(email), 'uid']))
  }

  async createUserEmailIndex(userId, email) {
    return this.setIndexValue(mkKey(['email', this._normalizeUserEmail(email), 'uid']), userId)
  }

  async dropUserEmailIndex(email) {
    return this.deleteRecord(mkKey(['email', this._normalizeUserEmail(email), 'uid']))
  }

  ///////////////////////////////////////////////////
  // Group administrators
  ///////////////////////////////////////////////////

  async getGroupAdministratorsIds(groupId) {
    return this.getAllSortedSetElements(mkKey(['user', groupId, 'administrators']))
  }

  async addAdministratorToGroup(groupId, adminId) {
    let now = new Date().getTime()
    return this.addElementToSortedSet(mkKey(['user', groupId, 'administrators']), now, adminId)
  }

  async removeAdministratorFromGroup(groupId, adminId) {
    return this.removeElementFromSortedSet(mkKey(['user', groupId, 'administrators']), adminId)
  }

  ///////////////////////////////////////////////////
  // Timelines
  ///////////////////////////////////////////////////

  async createTimeline(timelineId, payload) {
    return this.createRecord(mkKey(['timeline', timelineId]), payload)
  }

  async addPostToTimeline(timelineId, time, postId) {
    return this.addElementToSortedSet(mkKey(['timeline', timelineId, 'posts']), time, postId)
  }

  async isPostPresentInTimeline(timelineId, postId) {
    let score = await this.getSortedSetElementScore(mkKey(['timeline', timelineId, 'posts']), postId)
    return score && score >= 0
  }

  async getTimelinePostsCount(timelineId) {
    return this.getSortedSetElementsCount(mkKey(['timeline', timelineId, 'posts']))
  }

  async getTimelinePostsRange(timelineId, startIndex, finishIndex) {
    return this.getSortedSetElements(mkKey(['timeline', timelineId, 'posts']), startIndex, finishIndex)
  }

  async getTimelinePostsInTimeInterval(timelineId, timeIntervalStart, timeIntervalEnd) {
    return this.database.zrevrangebyscoreAsync(mkKey(['timeline', timelineId, 'posts']), timeIntervalStart, timeIntervalEnd)
  }

  async removePostFromTimeline(timelineId, postId) {
    return this.removeElementFromSortedSet(mkKey(['timeline', timelineId, 'posts']), postId)
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
    return this.getAllSortedSetElements(mkKey(['timeline', timelineId, 'subscribers']))
  }

  async addTimelineSubscriber(timelineId, currentTime, currentUserId) {
    return this.addElementToSortedSet(mkKey(['timeline', timelineId, 'subscribers']), currentTime, currentUserId)
  }

  async removeTimelineSubscriber(timelineId, currentUserId) {
    return this.removeElementFromSortedSet(mkKey(['timeline', timelineId, 'subscribers']), currentUserId)
  }

  async getTimelinesIntersectionPostIds(timelineId1, timelineId2){
    // zinterstore saves results to a key. so we have to
    // create a temporary storage

    let randomKey = mkKey(['timeline', timelineId1, 'random', uuid.v4()])
    await this.getPostsTimelinesIntersection(randomKey, timelineId2, timelineId1)

    let postIds = await this.getTimelinesIntersectionPosts(randomKey)
    await this.deleteRecord(randomKey)

    return postIds
  }

  ///////////////////////////////////////////////////
  // Stats
  ///////////////////////////////////////////////////

  async createUserStats(userId, payload) {
    return this.updateRecord(mkKey(['stats', userId]), payload)
  }

  async changeUserStatsValue(userId, property, value) {
    return this.database.hincrbyAsync(mkKey(['stats', userId]), property, value)
  }

  async addUserLikesStats(userId, likes) {
    return this.addElementToSortedSet(mkKey(['stats', 'likes']), likes, userId)
  }

  async addUserPostsStats(userId, posts) {
    return this.addElementToSortedSet(mkKey(['stats', 'posts']), posts, userId)
  }

  async addUserCommentsStats(userId, comments) {
    return this.addElementToSortedSet(mkKey(['stats', 'comments']), comments, userId)
  }

  async addUserSubscribersStats(userId, subscribers) {
    return this.addElementToSortedSet(mkKey(['stats', 'subscribers']), subscribers, userId)
  }

  async addUserSubscriptionsStats(userId, subscriptions) {
    return this.addElementToSortedSet(mkKey(['stats', 'subscriptions']), subscriptions, userId)
  }

  async changeUserStats(userId, property, value) {
    return this.database.zincrbyAsync(mkKey(['stats', property]), value, userId)
  }


  ///////////////////////////////////////////////////
  // Comments
  ///////////////////////////////////////////////////

  async createComment(payload) {
    let commentId = uuid.v4()
    let key = mkKey(['comment', commentId])
    let exists = await this.existsRecord(key)

    if (exists !== 0){
      throw new Error("Already exists")
    }

    await this.createRecord(key, payload)
    return commentId
  }

  async updateComment(commentId, payload) {
    return this.updateRecord(mkKey(['comment', commentId]), payload)
  }

  async deleteComment(commentId) {
    return this.deleteRecord(mkKey(['comment', commentId]))
  }

  ///////////////////////////////////////////////////
  // Attachments
  ///////////////////////////////////////////////////

  async createAttachment(attachmentId, payload) {
    return this.createRecord(mkKey(['attachment', attachmentId]), payload)
  }

  async setAttachmentPostId(attachmentId, postId) {
    let payload = {
      'postId': postId
    }
    return this.updateRecord(mkKey(['attachment', attachmentId]), payload)
  }

  ///////////////////////////////////////////////////
  // Timeline utils
  ///////////////////////////////////////////////////


  async getTimelinesIntersectionPosts(key) {
    return this.database.zrangeAsync(key, 0, -1)
  }

  ///////////////////////////////////////////////////
  // AbstractModel
  ///////////////////////////////////////////////////

  async findRecordById(modelName, modelId) {
    return this.getRecord(mkKey([modelName, modelId]))
  }

  async findRecordsByIds(modelName, modelIds) {
    let keys     = modelIds.map(id => mkKey([modelName, id]))
    let requests = keys.map(key => ['hgetall', key])

    return this.database.batch(requests).execAsync()
  }

  async findUserByAttributeIndex(attribute, value) {
    return this.getIndexValue(mkKey([attribute, value, 'uid']))
  }

  ///////////////////////////////////////////////////
  // Base methods
  ///////////////////////////////////////////////////

  async existsRecord(key) {
    return this.database.existsAsync(key)
  }

  async getRecord(key){
    return this.database.hgetallAsync(key)
  }

  async createRecord(key, payload){
    return this.database.hmsetAsync(key, payload)
  }

  async updateRecord(key, payload){
    return this.database.hmsetAsync(key, payload)
  }

  async deleteRecord(key) {
    return this.database.delAsync(key)
  }

  async getIndexValue(key) {
    return this.database.getAsync(key)
  }

  async setIndexValue(key, value) {
    return this.database.setAsync(key, value)
  }

  ///////////////////////////////////////////////////

  async getSortedSetElementsCount(key){
    return this.database.zcardAsync(key)
  }

  async getSortedSetElementScore(key, element){
    return await this.database.zscoreAsync(key, element)
  }

  async getSortedSetElements(key, fromIndex, toIndex){
    return this.database.zrevrangeAsync(key, fromIndex, toIndex)
  }

  async getAllSortedSetElements(key){
    return this.getSortedSetElements(key, 0, -1)
  }

  async addElementToSortedSet(key, score, element){
    return this.database.zaddAsync(key, score, element)
  }

  async removeElementFromSortedSet(key, element){
    return this.database.zremAsync(key, element)
  }

  ///////////////////////////////////////////////////

  async getSetElementsCount(key){
    return this.database.scardAsync(key)
  }

  async getSetElements(key){
    return this.database.smembersAsync(key)
  }

  async addElementToSet(key, element) {
    return this.database.saddAsync(key, element)
  }

  async removeElementFromSet(key, element){
    return this.database.sremAsync(key, element)
  }

  ///////////////////////////////////////////////////

  async getListElementsCount(key) {
    return this.database.llenAsync(key)
  }

  async getListElementsRange(key, fromIndex, toIndex) {
    return this.database.lrangeAsync(key, fromIndex, toIndex)
  }

  async getAllListElements(key) {
    return this.getListElementsRange(key, 0, -1)
  }

  async addElementToList(key, element) {
    return this.database.rpushAsync(key, element)
  }

  async removeOneElementFromList(key, element) {
    return this.database.lremAsync(key, 1, element)
  }

  async removeAllElementsEqualToFromList(key, element) {
    return this.database.lremAsync(key, 0, element)
  }



  ///////////////////////////////////////////////////
  // Private
  ///////////////////////////////////////////////////


  _normalizeUserEmail(email){
    return email.toLowerCase()
  }
}