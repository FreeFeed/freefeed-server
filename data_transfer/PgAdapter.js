import _ from 'lodash'
import validator from 'validator'

const USER_COLUMNS = {
  id:                     "uid",
  username:               "username",
  screenName:             "screen_name",
  email:                  "email",
  description:            "description",
  type:                   "type",
  profilePictureUuid:     "profile_picture_uuid",
  createdAt:              "created_at",
  updatedAt:              "updated_at",
  isPrivate:              "is_private",
  isRestricted:           "is_restricted",
  hashedPassword:         "hashed_password",
  resetPasswordToken:     "reset_password_token",
  resetPasswordSentAt:    "reset_password_sent_at",
  resetPasswordExpiresAt: "reset_password_expires_at",
  frontendPreferences:    "frontend_preferences"
}

const USER_COLUMNS_MAPPING = {
  username:               (username)=>{return username.toLowerCase()},
  createdAt:              (timestamp)=>{
    let d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  updatedAt:              (timestamp)=>{
    let d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  isPrivate:              (is_private)=>{return is_private === '1'},
  isRestricted:           (is_restricted)=>{return is_restricted === '1'},
  resetPasswordSentAt:    (timestamp)=>{
    let d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  }
}

const ATTACHMENT_COLUMNS = {
  id:                     "uid",
  createdAt:              "created_at",
  updatedAt:              "updated_at",
  fileName:               "file_name",
  fileSize:               "file_size",
  mimeType:               "mime_type",
  mediaType:              "media_type",
  fileExtension:          "file_extension",
  noThumbnail:            "no_thumbnail",
  imageSizes:             "image_sizes",
  artist:                 "artist",
  title:                  "title",
  userId:                 "user_id",
  postId:                 "post_id"
}

const ATTACHMENT_COLUMNS_MAPPING = {
  createdAt:              (timestamp)=>{
    let d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  updatedAt:              (timestamp)=>{
    let d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  noThumbnail:            (no_thumbnail)=>{return no_thumbnail === '1'},
  fileSize:               (file_size)=>{
    return parseInt(file_size, 10)
  },
  postId:                 (post_id)=> {
    if (validator.isUUID(post_id, 4)) {
      return post_id
    }
    return null
  },
  userId:                 (user_id)=> {
    if (validator.isUUID(user_id, 4)) {
      return user_id
    }
    return null
  }
}


const COMMENT_COLUMNS = {
  createdAt:              "created_at",
  updatedAt:              "updated_at",
  body:                   "body",
  postId:                 "post_id",
  userId:                 "user_id"
}

const COMMENT_COLUMNS_MAPPING = {
  createdAt:              (timestamp)=>{
    let d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  updatedAt:              (timestamp)=>{
    let d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  }
}

const COMMENT_FIELDS = {
  uid:                    "id",
  created_at:             "createdAt",
  updated_at:             "updatedAt",
  body:                   "body",
  user_id:                "userId",
  post_id:                "postId"
}

const COMMENT_FIELDS_MAPPING = {
  created_at:                 (time)=>{ return time.getTime() },
  updated_at:                 (time)=>{ return time.getTime() },
  post_id:                    (post_id)=> {return post_id ? post_id : ''},
  user_id:                    (user_id)=> {return user_id ? user_id : ''}
}


const FEED_COLUMNS = {
  id:                     "uid",
  createdAt:              "created_at",
  updatedAt:              "updated_at",
  name:                   "name",
  userId:                 "user_id"
}

const FEED_COLUMNS_MAPPING = {
  createdAt:              (timestamp)=>{
    let d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  updatedAt:              (timestamp)=>{
    let d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  }
}

const POST_COLUMNS = {
  id:                     "uid",
  createdAt:              "created_at",
  updatedAt:              "updated_at",
  userId:                 "user_id",
  body:                   "body",
  commentsDisabled:       "comments_disabled"
}

const POST_COLUMNS_MAPPING = {
  createdAt:              (timestamp)=>{
    let d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  updatedAt:              (timestamp)=>{
    let d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  commentsDisabled:       (comments_disabled)=>{return comments_disabled === '1'},
  userId:                 (user_id)=> {
    if (validator.isUUID(user_id, 4)) {
      return user_id
    }
    return null
  }
}

export class PgAdapter {
  constructor(database) {
    this.database = database
  }
  
  ///////////////////////////////////////////////////
  // User
  ///////////////////////////////////////////////////

  _prepareModelPayload(payload, namesMapping, valuesMapping){
    return _.transform(payload, (result, val, key) => {
      let mappedVal = val
      if (valuesMapping[key]){
        mappedVal = valuesMapping[key](val)
      }
      let mappedKey = namesMapping[key]
      if (mappedKey){
        result[mappedKey] = mappedVal
      }
    })
  }

  async createUser(payload) {
    let preparedPayload = this._prepareModelPayload(payload, USER_COLUMNS, USER_COLUMNS_MAPPING)
    const res = await this.database('users').returning('uid').insert(preparedPayload)
    return res[0]
  }

  ///////////////////////////////////////////////////
  // Subscription requests
  ///////////////////////////////////////////////////

  createSubscriptionRequest(fromUserId, toUserId, timestamp){
    const d = new Date()
    d.setTime(timestamp)
    const requestTime = d.toISOString()

    const payload = {
      from_user_id: fromUserId,
      to_user_id: toUserId,
      created_at: requestTime
    }

    return this.database('subscription_requests').returning('id').insert(payload)
  }

  ///////////////////////////////////////////////////
  // Bans
  ///////////////////////////////////////////////////

  createUserBan(currentUserId, bannedUserId, timestamp){
    const d = new Date()
    d.setTime(timestamp)
    const banTime = d.toISOString()

    const payload = {
      user_id: currentUserId,
      banned_user_id: bannedUserId,
      created_at: banTime
    }

    return this.database('bans').returning('id').insert(payload)
  }

  ///////////////////////////////////////////////////
  // Group administrators
  ///////////////////////////////////////////////////

  addAdministratorToGroup(groupId, adminId, timestamp){
    const d = new Date()
    d.setTime(timestamp)
    const currentTime = d.toISOString()

    const payload = {
      user_id: adminId,
      group_id: groupId,
      created_at: currentTime
    }

    return this.database('group_admins').returning('id').insert(payload)
  }

  ///////////////////////////////////////////////////
  // Attachments
  ///////////////////////////////////////////////////

  async createAttachment(payload) {
    let preparedPayload = this._prepareModelPayload(payload, ATTACHMENT_COLUMNS, ATTACHMENT_COLUMNS_MAPPING)
    const res = await this.database('attachments').returning('uid').insert(preparedPayload)
    return res[0]
  }

  ///////////////////////////////////////////////////
  // Likes
  ///////////////////////////////////////////////////

  createUserPostLike(postId, userId) {
    const currentTime = new Date().toISOString()

    const payload = {
      post_id: postId,
      user_id: userId,
      created_at: currentTime
    }

    return this.database('likes').returning('id').insert(payload)
  }

  async getPostLikesCount(postId) {
    const res = await this.database('likes').where({ post_id: postId }).count()
    return parseInt(res[0].count)
  }

  async getUserLikesCount(userId){
    const res = await this.database('likes').where({ user_id: userId }).count()
    return parseInt(res[0].count)
  }

  async getPostLikesRange(postId, omittedLikesCount) {
    const res = await this.database('likes').select('user_id').orderBy('created_at', 'desc').where('post_id', postId)
    let userIds = res.map((record)=>{
      return record.user_id
    })
    userIds.splice(userIds.length - omittedLikesCount, omittedLikesCount)
    return userIds
  }

  async hasUserLikedPost(userId, postId) {
    const res = await this.database('likes').where({
      post_id: postId,
      user_id: userId
    }).count()
    return parseInt(res[0].count) != 0
  }

  async getUserPostLikedTime(userId, postId) {
    const res = await this.database('likes').select('created_at').where({
      post_id: postId,
      user_id: userId
    })
    const record = res[0]

    if (!record){
      return null
    }
    return record.created_at.getTime()
  }

  removeUserPostLike(postId, userId) {
    return this.database('likes').where({
      post_id: postId,
      user_id: userId
    }).delete()
  }

  _deletePostLikes(postId) {

    //TODO: 2 pg!
    return this.database('likes').where({ post_id: postId }).delete()
  }

  ///////////////////////////////////////////////////
  // Comments
  ///////////////////////////////////////////////////

  async createComment(payload) {
    let preparedPayload = this._prepareModelPayload(payload, COMMENT_COLUMNS, COMMENT_COLUMNS_MAPPING)
    const res = await this.database('comments').returning('uid').insert(preparedPayload)
    return res[0]
  }

  async getCommentById(id) {
    if (!validator.isUUID(id,4)){
      return null
    }
    const res = await this.database('comments').where('uid', id)
    let attrs = res[0]

    if (!attrs) {
      return null
    }

    attrs = this._prepareModelPayload(attrs, COMMENT_FIELDS, COMMENT_FIELDS_MAPPING)
    return attrs
  }

  async getCommentsByIds(ids) {
    const responses = await this.database('comments').whereIn('uid', ids).orderByRaw(`position(uid::text in '${ids.toString()}')`)

    const objects = responses.map((attrs) => {
      if (attrs){
        attrs = this._prepareModelPayload(attrs, COMMENT_FIELDS, COMMENT_FIELDS_MAPPING)
      }

      return attrs
    })

    return objects
  }

  updateComment(commentId, payload) {
    let preparedPayload = this._prepareModelPayload(payload, COMMENT_COLUMNS, COMMENT_COLUMNS_MAPPING)

    return this.database('comments').where('uid', commentId).update(preparedPayload)
  }

  deleteComment(commentId, postId) {
    return this.database('comments').where({
      uid: commentId,
      post_id: postId
    }).delete()
  }

  async getPostCommentsCount(postId) {
    const res = await this.database('comments').where({ post_id: postId }).count()
    return parseInt(res[0].count)
  }

  async getUserCommentsCount(userId){
    const res = await this.database('comments').where({ user_id: userId }).count()
    return parseInt(res[0].count)
  }

  async getPostFirstNCommentsIds(postId, n){
    const res = await this.database('comments').select('uid').limit(n).orderBy('created_at', 'asc').where('post_id', postId)
    let commentIds = res.map((record)=>{
      return record.uid
    })
    return commentIds
  }

  async getPostLastCommentId(postId){
    const res = await this.database('comments').select('uid').limit(1).orderBy('created_at', 'desc').where('post_id', postId)
    return res[0].uid
  }

  async getAllPostCommentsIds(postId){
    const res = await this.database('comments').select('uid').orderBy('created_at', 'asc').where('post_id', postId)
    let commentIds = res.map((record)=>{
      return record.uid
    })
    return commentIds
  }

  _deletePostComments(postId) {
    return this.database('comments').where({ post_id: postId }).delete()
  }


  ///////////////////////////////////////////////////
  // Feeds
  ///////////////////////////////////////////////////

  async createTimeline(payload) {
    let preparedPayload = this._prepareModelPayload(payload, FEED_COLUMNS, FEED_COLUMNS_MAPPING)
    if (preparedPayload.name == "MyDiscussions"){
      preparedPayload.uid = preparedPayload.user_id
    }
    const res = await this.database('feeds').returning('uid').insert(preparedPayload)
    return res[0]
  }

  async getTimelinesIntIdsByUUIDs(uuids) {
    const responses = await this.database('feeds').select('id').whereIn('uid', uuids)

    const ids = responses.map((record) => {
      return record.id
    })
    return ids
  }

  ///////////////////////////////////////////////////
  // Post
  ///////////////////////////////////////////////////

  async createPost(payload, destinations, usages) {
    let preparedPayload = this._prepareModelPayload(payload, POST_COLUMNS, POST_COLUMNS_MAPPING)
    let destTimelineIntIds = await this.getTimelinesIntIdsByUUIDs(destinations)
    preparedPayload.destination_feed_ids = destTimelineIntIds
    let usagesTimelineIntIds = await this.getTimelinesIntIdsByUUIDs(usages)
    preparedPayload.feed_ids = usagesTimelineIntIds
    const res = await this.database('posts').returning('uid').insert(preparedPayload)
    return res[0]
  }


  ///////////////////////////////////////////////////
  // Subscriptions
  ///////////////////////////////////////////////////

  async subscribeUserToTimeline(timelineId, currentUserId, timestamp){
    let d = new Date()
    d.setTime(timestamp)
    const currentTime = d.toISOString()

    const payload = {
      feed_id: timelineId,
      user_id: currentUserId,
      created_at: currentTime
    }
    await this.database('subscriptions').returning('id').insert(payload)

    let feedIntId = (await this.getTimelinesIntIdsByUUIDs([timelineId]))[0]

    return this.database
      .raw('UPDATE users SET subscribed_feed_ids = uniq(subscribed_feed_ids + ?) WHERE uid = ?', [[feedIntId], currentUserId])
  }
}
