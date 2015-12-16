"use strict";

import modelsSupport from '../support/models'
const mkKey = modelsSupport.mkKey

///////////////////////////////////////////////////
// User
///////////////////////////////////////////////////

export async function setUserPassword(database, userId, updatedAt, hashedPassword){
  return database.hmsetAsync(mkKey(['user', userId]),
    {
      'updatedAt':      updatedAt.toString(),
      'hashedPassword': hashedPassword
    })
}

export async function createUser(database, userId, payload){
  return database.hmsetAsync(mkKey(['user', userId]), payload)
}

export async function updateUser(database, userId, payload){
  return database.hmsetAsync(mkKey(['user', userId]), payload)
}

export async function existsUser(database, userId){
  return database.existsAsync(mkKey(['user', userId]))
}

export async function getUserById(database, userId){
  return database.hgetallAsync(mkKey(['user', userId]))
}

export async function getUsersByIds(database, userIds){
  let keys = userIds.map(id => mkKey(['user', id]))
  let requests = keys.map(key => ['hgetall', key])

  return database.batch(requests).execAsync()
}

///////////

export async function getUserTimelinesIds(database, userId){
  return database.hgetallAsync(mkKey(['user', userId, 'timelines']))
}

export async function createUserTimeline(database, userId, timelineName, timelineId){
  return database.hmsetAsync(mkKey(['user', userId, 'timelines']), timelineName, timelineId)
}


///////////////////////////////////////////////////
// Post
///////////////////////////////////////////////////

export async function createPost(database, postId, payload){
  return database.hmsetAsync(mkKey(['post', postId]), payload)
}

export async function updatePost(database, postId, payload){
  return database.hmsetAsync(mkKey(['post', postId]), payload)
}

export async function setPostUpdatedAt(database, postId, time){
  return database.hsetAsync(mkKey(['post', postId]), 'updatedAt', time)
}

export async function deletePost(database, postId){
  return database.delAsync(mkKey(['post', postId]))
}

///////////

export async function createUserPostLike(database, postId, likedTime, userId){
  return database.zaddAsync(mkKey(['post', postId, 'likes']), likedTime, userId)
}

export async function getPostLikesCount(database, postId){
  return database.zcardAsync(mkKey(['post', postId, 'likes']))
}

export async function getPostLikesRange(database, postId, fromIndex, toIndex){
  return database.zrevrangeAsync(mkKey(['post', postId, 'likes']), fromIndex, toIndex)
}

export async function getUserPostLikedTime(database, userId, postId){
  return database.zscoreAsync(mkKey(['post', postId, 'likes']), userId)
}

export async function removeUserPostLike(database, postId, userId){
  return database.zremAsync(mkKey(['post', postId, 'likes']), userId)
}

export async function deletePostLikes(database, postId){
  return database.delAsync(mkKey(['post', postId, 'likes']))
}

///////////

export async function createPostUsageInTimeline(database, postId, timelineId) {
  return database.saddAsync(mkKey(['post', postId, 'timelines']), timelineId)
}

export async function getPostUsagesInTimelinesCount(database, postId){
  return database.scardAsync(mkKey(['post', postId, 'timelines']))
}

export async function getPostUsagesInTimelines(database,postId){
  return database.smembersAsync(mkKey(['post', postId, 'timelines']))
}

export async function deletePostUsageInTimeline(database, postId, timelineId) {
  return database.sremAsync(mkKey(['post', postId, 'timelines']), timelineId)
}

export async function deletePostUsagesInTimelineIndex(database, postId){
  return database.delAsync(mkKey(['post', postId, 'timelines']))
}

///////////

export async function getPostPostedToIds(database, postId){
  return database.smembersAsync(mkKey(['post', postId, 'to']))
}

export async function createPostPostedTo(database, postId, timelineIds){
  return database.saddAsync(mkKey(['post', postId, 'to']), timelineIds)
}

export async function deletePostPostedTo(database, postId){
  return database.delAsync(mkKey(['post', postId, 'to']))
}

///////////

export async function getPostCommentsCount(database, postId){
  return database.llenAsync(mkKey(['post', postId, 'comments']))
}

export async function removeCommentFromPost(database, postId, commentId){
  return database.lremAsync(mkKey(['post', postId, 'comments']), 1, commentId)
}

export async function getPostCommentsRange(database, postId, fromIndex, toIndex){
  return database.lrangeAsync(mkKey(['post', postId, 'comments']), fromIndex, toIndex)
}

export async function addCommentToPost(database, postId, commentId){
  return database.rpushAsync(mkKey(['post', postId, 'comments']), commentId)
}

export async function deletePostComments(database, postId){
  return database.delAsync(mkKey(['post', postId, 'comments']))
}

///////////

export async function getPostAttachments(database, postId){
  return database.lrangeAsync(mkKey(['post', postId, 'attachments']), 0, -1)
}

export async function addAttachmentToPost(database, postId, attachmentId){
  return database.rpushAsync(mkKey(['post', postId, 'attachments']), attachmentId)
}

export async function removeAttachmentsFromPost(database, postId, attachmentId){
  return database.lremAsync(mkKey(['post', postId, 'attachments']), 0, attachmentId)
}


///////////////////////////////////////////////////
// Reset password tokens
///////////////////////////////////////////////////

export async function createUserResetPasswordToken(database, userId, token){
  return database.setAsync(mkKey(['reset', token, 'uid']), userId)
}

export async function setUserResetPasswordTokenExpireAfter(database, token, expireAfter){
  return database.expireAsync(mkKey(['reset', token, 'uid']), expireAfter)
}

export async function deleteUserResetPasswordToken(database, token){
  return database.delAsync(mkKey(['reset', token, 'uid']))
}

///////////////////////////////////////////////////
// Subscription requests
///////////////////////////////////////////////////

export async function getUserSubscriptionRequestsIds(database, currentUserId){
  return database.zrevrangeAsync(mkKey(['user', currentUserId, 'requests']), 0, -1)
}

export async function getUserSubscriptionRequestTime(database, currentUserId, followedUserId){
  return database.zscoreAsync(mkKey(['user', followedUserId, 'requests']), currentUserId)
}

export async function createUserSubscriptionRequest(database, currentUserId, currentTime, followedUserId){
  return database.zaddAsync(mkKey(['user', followedUserId, 'requests']), currentTime, currentUserId)
}

export async function deleteUserSubscriptionRequest(database, currentUserId, followerUserId){
  return database.zremAsync(mkKey(['user', currentUserId, 'requests']), followerUserId)
}

///////////////////////////////////////////////////
// Pending (sent) requests
///////////////////////////////////////////////////

export async function getUserSubscriptionPendingRequestsIds(database, currentUserId){
  return database.zrevrangeAsync(mkKey(['user', currentUserId, 'pending']), 0, -1)
}

export async function createUserSubscriptionPendingRequest(database, currentUserId, currentTime, followedUserId){
  return database.zaddAsync(mkKey(['user', currentUserId, 'pending']), currentTime, followedUserId)
}

export async function deleteUserSubscriptionPendingRequest(database, currentUserId, followerUserId){
  return database.zremAsync(mkKey(['user', followerUserId, 'pending']), currentUserId)
}

///////////////////////////////////////////////////
// Subscriptions
///////////////////////////////////////////////////

export async function getUserSubscriptionsIds(database, userId){
  return database.zrevrangeAsync(mkKey(['user', userId, 'subscriptions']), 0, -1)
}

export async function createUserSubscription(database, currentUserId, currentTime, timelineId){
  return database.zaddAsync(mkKey(['user', currentUserId, 'subscriptions']), currentTime, timelineId)
}

export async function deleteUserSubscription(database, currentUserId, timelineId){
  return database.zremAsync(mkKey(['user', currentUserId, 'subscriptions']), timelineId)
}

///////////////////////////////////////////////////
// Bans
///////////////////////////////////////////////////

export async function getUserBansIds(database, userId){
  return database.zrevrangeAsync(mkKey(['user', userId, 'bans']), 0, -1)
}

export async function createUserBan(database, currentUserId, currentTime, bannedUserId){
  return database.zaddAsync(mkKey(['user', currentUserId, 'bans']), currentTime, bannedUserId)
}

export async function deleteUserBan(database, currentUserId, bannedUserId){
  return database.zremAsync(mkKey(['user', currentUserId, 'bans']), bannedUserId)
}

///////////////////////////////////////////////////
// User indexes
///////////////////////////////////////////////////


export async function getUserIdByEmail(database, emailIndexKey){
  return database.getAsync(emailIndexKey)
}

export async function getUserIdByUsername(database, username){
  return database.getAsync(mkKey(['username', username, 'uid']))
}

export async function createUserUsernameIndex(database, userId, username){
  return database.setAsync(mkKey(['username', username, 'uid']), userId)
}

export async function createUserEmailIndex(database, userId, emailIndexKey){
  return database.setAsync(emailIndexKey, userId)
}

export async function dropUserEmailIndex(database, emailIndexKey){
  return database.delAsync(emailIndexKey)
}

///////////////////////////////////////////////////
// Group administrators
///////////////////////////////////////////////////

export async function getGroupAdministratorsIds(database, groupAdminsKey){
  return database.zrevrangeAsync(groupAdminsKey, 0, -1)
}

export async function addAdministatorToGroup(database, groupAdminsKey, currentTime, adminId){
  return database.zaddAsync(groupAdminsKey, currentTime, adminId)
}

export async function removeAdministatorFromGroup(database, groupAdminsKey, adminId){
  return database.zremAsync(groupAdminsKey, adminId)
}

///////////////////////////////////////////////////
// Timelines
///////////////////////////////////////////////////

export async function createTimeline(database, timelineId, payload){
  return database.hmsetAsync(mkKey(['timeline', timelineId]), payload)
}

export async function addPostToTimeline(database, timelineId, time, postId){
  return database.zaddAsync(mkKey(['timeline', timelineId, 'posts']), time, postId)
}

export async function getTimelinePostTime(database, timelineId, postId){
  return database.zscoreAsync(mkKey(['timeline', timelineId, 'posts']), postId)
}

export async function getTimelinePostsCount(database, timelineId){
  return database.zcardAsync(mkKey(['timeline', timelineId, 'posts']))
}

export async function getTimelinePostsRange(database, timelineId, startIndex, finishIndex){
  return database.zrevrangeAsync(mkKey(['timeline', timelineId, 'posts']), startIndex, finishIndex)
}

export async function getTimelinePostsInTimeInterval(database, timelineId, timeIntervalStart, timeIntervalEnd){
  return database.zrevrangebyscoreAsync(mkKey(['timeline', timelineId, 'posts']), timeIntervalStart, timeIntervalEnd)
}

export async function removePostFromTimeline(database, timelineId, postId){
  return database.zremAsync(mkKey(['timeline', timelineId, 'posts']), postId)
}

export async function createMergedPostsTimeline(database, destinationTimelineId, sourceTimelineId1, sourceTimelineId2){
  return database.zunionstoreAsync(
    mkKey(['timeline', destinationTimelineId, 'posts']), 2,
    mkKey(['timeline', sourceTimelineId1, 'posts']),
    mkKey(['timeline', sourceTimelineId2, 'posts']),
    'AGGREGATE', 'MAX'
  )
}

export async function getPostsTimelinesIntersection(database, destKey, sourceTimelineId1, sourceTimelineId2){
  return database.zinterstoreAsync(
    destKey, 2,
    mkKey(['timeline', sourceTimelineId1, 'posts']),
    mkKey(['timeline', sourceTimelineId2, 'posts']),
    'AGGREGATE', 'MAX'
  )
}

export async function getTimelineSubscribers(database, timelineId){
  return database.zrevrangeAsync(mkKey(['timeline', timelineId, 'subscribers']), 0, -1)
}

export async function addTimelineSubscriber(database, timelineId, currentTime, currentUserId){
  return database.zaddAsync(mkKey(['timeline', timelineId, 'subscribers']), currentTime, currentUserId)
}

export async function removeTimelineSubscriber(database, timelineId, currentUserId){
  return database.zremAsync(mkKey(['timeline', timelineId, 'subscribers']), currentUserId)
}

///////////////////////////////////////////////////
// Stats
///////////////////////////////////////////////////

export async function updateUserStats(database, userId, payload){
  return database.hmsetAsync(mkKey(['stats', userId]), payload)
}

export async function addUserLikesStats(database, userId, likes){
  return database.zaddAsync(mkKey(['stats', 'likes']), likes, userId)
}

export async function addUserPostsStats(database, userId, posts){
  return database.zaddAsync(mkKey(['stats', 'posts']), posts, userId)
}

export async function addUserCommentsStats(database, userId, comments){
  return database.zaddAsync(mkKey(['stats', 'comments']), comments, userId)
}

export async function addUserSubscribersStats(database, userId, subscribers){
  return database.zaddAsync(mkKey(['stats', 'subscribers']), subscribers, userId)
}

export async function addUserSubscriptionsStats(database, userId, subscriptions){
  return database.zaddAsync(mkKey(['stats', 'subscriptions']), subscriptions, userId)
}

export async function changeUserStatsValue(database, userId, property, value){
  return database.hincrbyAsync('stats:' + userId, property, value)
}

export async function changeUserStats(database, userId, property, value){
  return database.zincrbyAsync(mkKey(['stats', property]), value, userId)
}


///////////////////////////////////////////////////
// Comments
///////////////////////////////////////////////////

export async function createComment(database, commentId, payload){
  return database.hmsetAsync(mkKey(['comment', commentId]), payload)
}

export async function updateComment(database, commentId, payload){
  return database.hmsetAsync(mkKey(['comment', commentId]), payload)
}

export async function deleteComment(database, commentId){
  return database.delAsync(mkKey(['comment', commentId]))
}

///////////////////////////////////////////////////
// Attachments
///////////////////////////////////////////////////

export async function createAttachment(database, attachmentId, payload){
  return database.hmsetAsync(mkKey(['attachment', attachmentId]), payload)
}

export async function setAttachmentPostId(database, attachmentId, postId){
  return database.hsetAsync(mkKey(['attachment', attachmentId]), 'postId', postId)
}

///////////////////////////////////////////////////
// Timeline utils
///////////////////////////////////////////////////


export async function getTimelinesIntersectionPosts(database, key){
  return database.zrangeAsync(key, 0, -1)
}

export async function deleteRecord(database, key){
  return database.delAsync(key)
}

///////////////////////////////////////////////////
// AbstractModel
///////////////////////////////////////////////////

export async function findRecordById(database, modelName, modelId){
  return database.hgetallAsync(mkKey([modelName, modelId]))
}

export async function findRecordsByIds(database, modelName, modelIds){
  let keys = modelIds.map(id => mkKey([modelName, id]))
  let requests = keys.map(key => ['hgetall', key])

  return database.batch(requests).execAsync()
}

export async function findUserByAttributeIndex(database, attribute, value){
  return database.getAsync(mkKey([attribute, value, 'uid']))
}

export async function existsRecord(database, key){
  return database.existsAsync(key)
}