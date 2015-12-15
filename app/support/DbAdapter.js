"use strict";

import modelsSupport from '../support/models'
const mkKey = modelsSupport.mkKey

///////////////////////////////////////////////////
// User
///////////////////////////////////////////////////

export async function setUserPassword(database, userId, updatedAt, hashedPassword){
  return await database.hmsetAsync(mkKey(['user', userId]),
    {
      'updatedAt':      updatedAt.toString(),
      'hashedPassword': hashedPassword
    })
}

export async function createUser(database, userId, payload){
  return await database.hmsetAsync(mkKey(['user', userId]), payload)
}

export async function updateUser(database, userId, payload){
  return await database.hmsetAsync(mkKey(['user', userId]), payload)
}

export async function existsUser(database, userId){
  return await database.existsAsync(mkKey(['user', userId]))
}

export async function getUserById(database, userId){
  return await database.hgetallAsync(mkKey(['user', userId]))
}

export async function getUsersByIds(database, userIds){
  let keys = userIds.map(id => mkKey(['user', id]))
  let requests = keys.map(key => ['hgetall', key])

  return await database.batch(requests).execAsync()
}

///////////

export async function getUserTimelinesIds(database, userId){
  return await database.hgetallAsync(mkKey(['user', userId, 'timelines']))
}

export async function createUserTimeline(database, userId, timelineName, timelineId){
  return await database.hmsetAsync(mkKey(['user', userId, 'timelines']), timelineName, timelineId)
}


///////////////////////////////////////////////////
// Post
///////////////////////////////////////////////////

export async function createPost(database, postId, payload){
  return await database.hmsetAsync(mkKey(['post', postId]), payload)
}

export async function updatePost(database, postId, payload){
  return await database.hmsetAsync(mkKey(['post', postId]), payload)
}

export async function setPostUpdatedAt(database, postId, time){
  return await database.hsetAsync(mkKey(['post', postId]), 'updatedAt', time)
}

export async function deletePost(database, postId){
  return await database.delAsync(mkKey(['post', postId]))
}

///////////

export async function createUserPostLike(database, postId, likedTime, userId){
  return await database.zaddAsync(mkKey(['post', postId, 'likes']), likedTime, userId)
}

export async function getPostLikesCount(database, postId){
  return await database.zcardAsync(mkKey(['post', postId, 'likes']))
}

export async function getPostLikesRange(database, postId, fromIndex, toIndex){
  return await database.zrevrangeAsync(mkKey(['post', postId, 'likes']), fromIndex, toIndex)
}

export async function getUserPostLikedTime(database, userId, postId){
  return await database.zscoreAsync(mkKey(['post', postId, 'likes']), userId)
}

export async function removeUserPostLike(database, postId, userId){
  return await database.zremAsync(mkKey(['post', postId, 'likes']), userId)
}

export async function deletePostLikes(database, postId){
  return await database.delAsync(mkKey(['post', postId, 'likes']))
}

///////////

export async function createPostUsageInTimeline(database, postId, timelineId) {
  return await database.saddAsync(mkKey(['post', postId, 'timelines']), timelineId)
}

export async function getPostUsagesInTimelinesCount(database, postId){
  return await database.scardAsync(mkKey(['post', postId, 'timelines']))
}

export async function getPostUsagesInTimelines(database,postId){
  return await database.smembersAsync(mkKey(['post', postId, 'timelines']))
}

export async function deletePostUsageInTimeline(database, postId, timelineId) {
  return await database.sremAsync(mkKey(['post', postId, 'timelines']), timelineId)
}

export async function deletePostUsagesInTimelineIndex(database, postId){
  return await database.delAsync(mkKey(['post', postId, 'timelines']))
}

///////////

export async function getPostPostedToIds(database, postId){
  return await database.smembersAsync(mkKey(['post', postId, 'to']))
}

export async function createPostPostedTo(database, postId, timelineIds){
  return await database.saddAsync(mkKey(['post', postId, 'to']), timelineIds)
}

export async function deletePostPostedTo(database, postId){
  return await database.delAsync(mkKey(['post', postId, 'to']))
}

///////////

export async function getPostCommentsCount(database, postId){
  return await database.llenAsync(mkKey(['post', postId, 'comments']))
}

export async function removeCommentFromPost(database, postId, commentId){
  return await database.lremAsync(mkKey(['post', postId, 'comments']), 1, commentId)
}

export async function getPostCommentsRange(database, postId, fromIndex, toIndex){
  return await database.lrangeAsync(mkKey(['post', postId, 'comments']), fromIndex, toIndex)
}

export async function addCommentToPost(database, postId, commentId){
  return await database.rpushAsync(mkKey(['post', postId, 'comments']), commentId)
}

export async function deletePostComments(database, postId){
  return await database.delAsync(mkKey(['post', postId, 'comments']))
}

///////////

export async function getPostAttachments(database, postId){
  return await database.lrangeAsync(mkKey(['post', postId, 'attachments']), 0, -1)
}

export async function addAttachmentToPost(database, postId, attachmentId){
  return await database.rpushAsync(mkKey(['post', postId, 'attachments']), attachmentId)
}

export async function removeAttachmentsFromPost(database, postId, attachmentId){
  return await database.lremAsync(mkKey(['post', postId, 'attachments']), 0, attachmentId)
}


///////////////////////////////////////////////////
// Reset password tokens
///////////////////////////////////////////////////

export async function createUserResetPasswordToken(database, userId, token){
  return await database.setAsync(mkKey(['reset', token, 'uid']), userId)
}

export async function setUserResetPasswordTokenExpireAfter(database, token, expireAfter){
  return await database.expireAsync(mkKey(['reset', token, 'uid']), expireAfter)
}

export async function deleteUserResetPasswordToken(database, token){
  return await database.delAsync(mkKey(['reset', token, 'uid']))
}

///////////////////////////////////////////////////
// Subscription requests
///////////////////////////////////////////////////

export async function getUserSubscriptionRequestsIds(database, currentUserId){
  return await database.zrevrangeAsync(mkKey(['user', currentUserId, 'requests']), 0, -1)
}

export async function getUserSubscriptionRequestTime(database, currentUserId, followedUserId){
  return await database.zscoreAsync(mkKey(['user', followedUserId, 'requests']), currentUserId)
}

export async function createUserSubscriptionRequest(database, currentUserId, currentTime, followedUserId){
  return await database.zaddAsync(mkKey(['user', followedUserId, 'requests']), currentTime, currentUserId)
}

export async function deleteUserSubscriptionRequest(database, currentUserId, followerUserId){
  return database.zremAsync(mkKey(['user', currentUserId, 'requests']), followerUserId)
}

///////////////////////////////////////////////////
// Pending (sent) requests
///////////////////////////////////////////////////

export async function getUserSubscriptionPendingRequestsIds(database, currentUserId){
  return await database.zrevrangeAsync(mkKey(['user', currentUserId, 'pending']), 0, -1)
}

export async function createUserSubscriptionPendingRequest(database, currentUserId, currentTime, followedUserId){
  return await database.zaddAsync(mkKey(['user', currentUserId, 'pending']), currentTime, followedUserId)
}

export async function deleteUserSubscriptionPendingRequest(database, currentUserId, followerUserId){
  return database.zremAsync(mkKey(['user', followerUserId, 'pending']), currentUserId)
}

///////////////////////////////////////////////////
// Subscriptions
///////////////////////////////////////////////////

export async function getUserSubscriptionsIds(database, userId){
  return await database.zrevrangeAsync(mkKey(['user', userId, 'subscriptions']), 0, -1)
}

export async function createUserSubscription(database, currentUserId, currentTime, timelineId){
  return await database.zaddAsync(mkKey(['user', currentUserId, 'subscriptions']), currentTime, timelineId)
}

export async function deleteUserSubscription(database, currentUserId, timelineId){
  return await database.zremAsync(mkKey(['user', currentUserId, 'subscriptions']), timelineId)
}

///////////////////////////////////////////////////
// Bans
///////////////////////////////////////////////////

export async function getUserBansIds(database, userId){
  return await database.zrevrangeAsync(mkKey(['user', userId, 'bans']), 0, -1)
}

export async function createUserBan(database, currentUserId, currentTime, bannedUserId){
  return await database.zaddAsync(mkKey(['user', currentUserId, 'bans']), currentTime, bannedUserId)
}

export async function deleteUserBan(database, currentUserId, bannedUserId){
  return await database.zremAsync(mkKey(['user', currentUserId, 'bans']), bannedUserId)
}

///////////////////////////////////////////////////
// User indexes
///////////////////////////////////////////////////


export async function getUserIdByEmail(database, emailIndexKey){
  return await database.getAsync(emailIndexKey)
}

export async function getUserIdByUsername(database, username){
  return await database.getAsync(mkKey(['username', username, 'uid']))
}

export async function createUserUsernameIndex(database, userId, username){
  return await database.setAsync(mkKey(['username', username, 'uid']), userId)
}

export async function createUserEmailIndex(database, userId, emailIndexKey){
  return await database.setAsync(emailIndexKey, userId)
}

export async function dropUserEmailIndex(database, emailIndexKey){
  return await database.delAsync(emailIndexKey)
}

///////////////////////////////////////////////////
// Group administrators
///////////////////////////////////////////////////

export async function getGroupAdministratorsIds(database, groupAdminsKey){
  return await database.zrevrangeAsync(groupAdminsKey, 0, -1)
}

export async function addAdministatorToGroup(database, groupAdminsKey, currentTime, adminId){
  return await database.zaddAsync(groupAdminsKey, currentTime, adminId)
}

export async function removeAdministatorFromGroup(database, groupAdminsKey, adminId){
  return await database.zremAsync(groupAdminsKey, adminId)
}

///////////////////////////////////////////////////
// Timelines
///////////////////////////////////////////////////

export async function createTimeline(database, timelineId, payload){
  return await database.hmsetAsync(mkKey(['timeline', timelineId]), payload)
}

export async function addPostToTimeline(database, timelineId, time, postId){
  return await database.zaddAsync(mkKey(['timeline', timelineId, 'posts']), time, postId)
}

export async function getTimelinePostTime(database, timelineId, postId){
  return await database.zscoreAsync(mkKey(['timeline', timelineId, 'posts']), postId)
}

export async function getTimelinePostsCount(database, timelineId){
  return await database.zcardAsync(mkKey(['timeline', timelineId, 'posts']))
}

export async function getTimelinePostsRange(database, timelineId, startIndex, finishIndex){
  return await database.zrevrangeAsync(mkKey(['timeline', timelineId, 'posts']), startIndex, finishIndex)
}

export async function getTimelinePostsInTimeInterval(database, timelineId, timeIntervalStart, timeIntervalEnd){
  return await database.zrevrangebyscoreAsync(mkKey(['timeline', timelineId, 'posts']), timeIntervalStart, timeIntervalEnd)
}

export async function removePostFromTimeline(database, timelineId, postId){
  return await database.zremAsync(mkKey(['timeline', timelineId, 'posts']), postId)
}

export async function createMergedPostsTimeline(database, destinationTimelineId, sourceTimelineId1, sourceTimelineId2){
  return await database.zunionstoreAsync(
    mkKey(['timeline', destinationTimelineId, 'posts']), 2,
    mkKey(['timeline', sourceTimelineId1, 'posts']),
    mkKey(['timeline', sourceTimelineId2, 'posts']),
    'AGGREGATE', 'MAX'
  )
}

export async function getPostsTimelinesIntersection(database, destKey, sourceTimelineId1, sourceTimelineId2){
  return await database.zinterstoreAsync(
    destKey, 2,
    mkKey(['timeline', sourceTimelineId1, 'posts']),
    mkKey(['timeline', sourceTimelineId2, 'posts']),
    'AGGREGATE', 'MAX'
  )
}

export async function getTimelineSubscribers(database, timelineId){
  return await database.zrevrangeAsync(mkKey(['timeline', timelineId, 'subscribers']), 0, -1)
}

export async function addTimelineSubscriber(database, timelineId, currentTime, currentUserId){
  return await database.zaddAsync(mkKey(['timeline', timelineId, 'subscribers']), currentTime, currentUserId)
}

export async function removeTimelineSubscriber(database, timelineId, currentUserId){
  return await database.zremAsync(mkKey(['timeline', timelineId, 'subscribers']), currentUserId)
}

///////////////////////////////////////////////////
// Stats
///////////////////////////////////////////////////

export async function updateUserStats(database, userId, payload){
  return await database.hmsetAsync(mkKey(['stats', userId]), payload)
}

export async function addUserLikesStats(database, userId, likes){
  return await database.zaddAsync(mkKey(['stats', 'likes']), likes, userId)
}

export async function addUserPostsStats(database, userId, posts){
  return await database.zaddAsync(mkKey(['stats', 'posts']), posts, userId)
}

export async function addUserCommentsStats(database, userId, comments){
  return await database.zaddAsync(mkKey(['stats', 'comments']), comments, userId)
}

export async function addUserSubscribersStats(database, userId, subscribers){
  return await database.zaddAsync(mkKey(['stats', 'subscribers']), subscribers, userId)
}

export async function addUserSubscriptionsStats(database, userId, subscriptions){
  return await database.zaddAsync(mkKey(['stats', 'subscriptions']), subscriptions, userId)
}

export async function changeUserStatsValue(database, userId, property, value){
  return await database.hincrbyAsync('stats:' + userId, property, value)
}

export async function changeUserStats(database, userId, property, value){
  return await database.zincrbyAsync(mkKey(['stats', property]), value, userId)
}


///////////////////////////////////////////////////
// Comments
///////////////////////////////////////////////////

export async function createComment(database, commentId, payload){
  return await database.hmsetAsync(mkKey(['comment', commentId]), payload)
}

export async function updateComment(database, commentId, payload){
  return await database.hmsetAsync(mkKey(['comment', commentId]), payload)
}

export async function deleteComment(database, commentId){
  return await database.delAsync(mkKey(['comment', commentId]))
}

///////////////////////////////////////////////////
// Attachments
///////////////////////////////////////////////////

export async function createAttachment(database, attachmentId, payload){
  return await database.hmsetAsync(mkKey(['attachment', attachmentId]), payload)
}

export async function setAttachmentPostId(database, attachmentId, postId){
  return await database.hsetAsync(mkKey(['attachment', attachmentId]), 'postId', postId)
}

///////////////////////////////////////////////////
// Timeline utils
///////////////////////////////////////////////////


export async function getTimelinesIntersectionPosts(database, key){
  return await database.zrangeAsync(key, 0, -1)
}

export async function deleteRecord(database, key){
  return await database.delAsync(key)
}

///////////////////////////////////////////////////
// AbstractModel
///////////////////////////////////////////////////

export async function findRecordById(database, modelName, modelId){
  return await database.hgetallAsync(mkKey([modelName, modelId]))
}

export async function findRecordsByIds(database, modelName, modelIds){
  let keys = modelIds.map(id => mkKey([modelName, id]))
  let requests = keys.map(key => ['hgetall', key])

  return await database.batch(requests).execAsync()
}

export async function findUserByAttributeIndex(database, attribute, value){
  return await database.getAsync(mkKey([attribute, value, 'uid']))
}

export async function existsRecord(database, key){
  return await database.existsAsync(key)
}