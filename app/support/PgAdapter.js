import _ from 'lodash'
import validator from 'validator'

import { Attachment, Comment, Group, User } from '../models'

const USER_COLUMNS = {
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

const USER_FIELDS = {
  uid:                        "id",
  username:                   "username",
  screen_name:                "screenName",
  email:                      "email",
  description:                "description",
  type:                       "type",
  profile_picture_uuid:       "profilePictureUuid",
  created_at:                 "createdAt",
  updated_at:                 "updatedAt",
  is_private:                 "isPrivate",
  is_restricted:              "isRestricted",
  hashed_password:            "hashedPassword",
  reset_password_token:       "resetPasswordToken",
  reset_password_sent_at:     "resetPasswordSentAt",
  reset_password_expires_at:  "resetPasswordExpiresAt",
  frontend_preferences:       "frontendPreferences"
}

const USER_FIELDS_MAPPING = {
  created_at:                 (time)=>{ return time.getTime() },
  updated_at:                 (time)=>{ return time.getTime() },
  is_private:                 (is_private)=>{return is_private ? '1' : '0' },
  is_restricted:              (is_restricted)=>{return is_restricted ? '1' : '0' },
  reset_password_sent_at:     (time)=>{ return time && time.getTime() },
  reset_password_expires_at:  (time)=>{ return time && time.getTime() }
}

const ATTACHMENT_COLUMNS = {
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

const ATTACHMENT_FIELDS = {
  uid:                    "id",
  created_at:             "createdAt",
  updated_at:             "updatedAt",
  file_name:              "fileName",
  file_size:              "fileSize",
  mime_type:              "mimeType",
  media_type:             "mediaType",
  file_extension:         "fileExtension",
  no_thumbnail:           "noThumbnail",
  image_sizes:            "imageSizes",
  artist:                 "artist",
  title:                  "title",
  user_id:                "userId",
  post_id:                "postId"
}

const ATTACHMENT_FIELDS_MAPPING = {
  created_at:                 (time)=>{ return time.getTime() },
  updated_at:                 (time)=>{ return time.getTime() },
  no_thumbnail:               (no_thumbnail)=>{return no_thumbnail ? '1' : '0' },
  file_size:                  (file_size)=>{return file_size && file_size.toString()},
  post_id:                    (post_id)=> {return post_id ? post_id : ''},
  user_id:                    (user_id)=> {return user_id ? user_id : ''}
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



export class PgAdapter {
  constructor(database) {
    this.database = database
  }

  static initObject(classDef, attrs, id, params) {
    return new classDef({...attrs, ...{id}, ...params})
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

  updateUser(userId, payload) {
    let tokenExpirationTime = new Date(Date.now())
    const expireAfter = 60*60*24 // 24 hours

    let preparedPayload = this._prepareModelPayload(payload, USER_COLUMNS, USER_COLUMNS_MAPPING)

    if (_.has(preparedPayload, 'reset_password_token')) {
      tokenExpirationTime.setHours(tokenExpirationTime.getHours() + expireAfter)
      preparedPayload['reset_password_expires_at'] = tokenExpirationTime.toISOString()
    }

    return this.database('users').where('uid', userId).update(preparedPayload)
  }

  async existsUser(userId) {
    const res = await this.database('users').where('uid', userId).count()
    return parseInt(res[0].count)
  }

  async existsUsername(username) {
    const res = await this.database('users').where('username', username).count()
    return parseInt(res[0].count)
  }

  async existsUserEmail(email) {
    const res = await this.database('users').whereRaw("LOWER(email)=LOWER(?)", email).count()
    return parseInt(res[0].count)
  }

  async getUserById(id) {
    const user = await this.getFeedOwnerById(id)

    if (!user) {
      return null
    }

    if (!(user instanceof User)) {
      throw new Error(`Expected User, got ${user.constructor.name}`)
    }

    return user
  }

  async getUsersByIds(userIds) {
    const users = await this.getFeedOwnersByIds(userIds)

    _.each(users, user => {
      if (!(user instanceof User)) {
        throw new Error(`Expected User, got ${user.constructor.name}`)
      }
    })

    return users
  }

  async getUserByUsername(username) {
    const feed = await this.getFeedOwnerByUsername(username)

    if (null === feed) {
      return null
    }

    if (!(feed instanceof User)) {
      throw new Error(`Expected User, got ${feed.constructor.name}`)
    }

    return feed
  }

  async getUserByResetToken(token) {
    const res = await this.database('users').where('reset_password_token', token)
    let attrs = res[0]

    if (!attrs) {
      return null
    }

    if (attrs.type !== 'user') {
      throw new Error(`Expected User, got ${attrs.type}`)
    }

    const now = new Date().getTime()
    if (attrs.reset_password_expires_at < now){
      return null
    }

    attrs = this._prepareModelPayload(attrs, USER_FIELDS, USER_FIELDS_MAPPING)

    return PgAdapter.initObject(User, attrs, attrs.id)
  }

  async getUserByEmail(email) {
    const res = await this.database('users').whereRaw("LOWER(email)=LOWER(?)", email)
    let attrs = res[0]

    if (!attrs) {
      return null
    }

    if (attrs.type !== 'user') {
      throw new Error(`Expected User, got ${attrs.type}`)
    }

    attrs = this._prepareModelPayload(attrs, USER_FIELDS, USER_FIELDS_MAPPING)

    return PgAdapter.initObject(User, attrs, attrs.id)
  }








  async getFeedOwnerById(id) {
    if (!validator.isUUID(id,4)){
      return null
    }
    const res = await this.database('users').where('uid', id)
    let attrs = res[0]

    if (!attrs) {
      return null
    }

    attrs = this._prepareModelPayload(attrs, USER_FIELDS, USER_FIELDS_MAPPING)

    if (attrs.type === 'group') {
      return PgAdapter.initObject(Group, attrs, id)
    }

    return PgAdapter.initObject(User, attrs, id)
  }

  async getFeedOwnersByIds(ids) {
    const responses = await this.database('users').whereIn('uid', ids)

    const objects = responses.map((attrs, i) => {
      if (attrs){
        attrs = this._prepareModelPayload(attrs, USER_FIELDS, USER_FIELDS_MAPPING)
      }

      if (attrs.type === 'group') {
        return PgAdapter.initObject(Group, attrs, ids[i])
      }

      return PgAdapter.initObject(User, attrs, ids[i])
    })

    return objects
  }

  async getFeedOwnerByUsername(username) {
    const res = await this.database('users').where('username', username.toLowerCase())
    let attrs = res[0]

    if (!attrs) {
      return null
    }

    attrs = this._prepareModelPayload(attrs, USER_FIELDS, USER_FIELDS_MAPPING)

    if (attrs.type === 'group') {
      return PgAdapter.initObject(Group, attrs, attrs.id)
    }

    return PgAdapter.initObject(User, attrs, attrs.id)
  }





  async getGroupById(id) {
    const user = await this.getFeedOwnerById(id)

    if (!user) {
      return null
    }

    if (!(user instanceof Group)) {
      throw new Error(`Expected Group, got ${user.constructor.name}`)
    }

    return user
  }

  async getGroupByUsername(username) {
    const feed = await this.getFeedOwnerByUsername(username)

    if (null === feed) {
      return null
    }

    if (!(feed instanceof Group)) {
      throw new Error(`Expected Group, got ${feed.constructor.name}`)
    }

    return feed
  }


  ///////////////////////////////////////////////////
  // Subscription requests
  ///////////////////////////////////////////////////

  createSubscriptionRequest(fromUserId, toUserId){
    const currentTime = new Date().toISOString()

    const payload = {
      from_user_id: fromUserId,
      to_user_id: toUserId,
      created_at: currentTime
    }

    return this.database('subscription_requests').returning('id').insert(payload)
  }

  deleteSubscriptionRequest(toUserId, fromUserId){
    return this.database('subscription_requests').where({
      from_user_id: fromUserId,
      to_user_id: toUserId
    }).delete()
  }

  async getUserSubscriptionRequestsIds(toUserId) {
    const res = await this.database('subscription_requests').select('from_user_id').orderBy('created_at', 'desc').where('to_user_id', toUserId)
    const attrs = res.map((record)=>{
      return record.from_user_id
    })
    return attrs
  }

  async isSubscriptionRequestPresent(fromUserId, toUserId) {
    const res = await this.database('subscription_requests').where({
      from_user_id: fromUserId,
      to_user_id: toUserId
    }).count()
    return parseInt(res[0].count) != 0
  }

  async getUserSubscriptionPendingRequestsIds(fromUserId) {
    const res = await this.database('subscription_requests').select('to_user_id').orderBy('created_at', 'desc').where('from_user_id', fromUserId)
    const attrs = res.map((record)=>{
      return record.to_user_id
    })
    return attrs
  }

  ///////////////////////////////////////////////////
  // Bans
  ///////////////////////////////////////////////////

  async getUserBansIds(userId) {
    const res = await this.database('bans').select('banned_user_id').orderBy('created_at', 'desc').where('user_id', userId)
    const attrs = res.map((record)=>{
      return record.banned_user_id
    })
    return attrs
  }

  createUserBan(currentUserId, bannedUserId) {
    const currentTime = new Date().toISOString()

    const payload = {
      user_id: currentUserId,
      banned_user_id: bannedUserId,
      created_at: currentTime
    }

    return this.database('bans').returning('id').insert(payload)
  }

  deleteUserBan(currentUserId, bannedUserId) {
    return this.database('bans').where({
      user_id: currentUserId,
      banned_user_id: bannedUserId
    }).delete()
  }

  ///////////////////////////////////////////////////
  // Group administrators
  ///////////////////////////////////////////////////

  async getGroupAdministratorsIds(groupId) {
    const res = await this.database('group_admins').select('user_id').orderBy('created_at', 'desc').where('group_id', groupId)
    const attrs = res.map((record)=>{
      return record.user_id
    })
    return attrs
  }

  addAdministratorToGroup(groupId, adminId) {
    const currentTime = new Date().toISOString()

    const payload = {
      user_id: adminId,
      group_id: groupId,
      created_at: currentTime
    }

    return this.database('group_admins').returning('id').insert(payload)
  }

  removeAdministratorFromGroup(groupId, adminId) {
    return this.database('group_admins').where({
      user_id: adminId,
      group_id: groupId
    }).delete()
  }

  ///////////////////////////////////////////////////
  // Attachments
  ///////////////////////////////////////////////////

  async createAttachment(payload) {
    let preparedPayload = this._prepareModelPayload(payload, ATTACHMENT_COLUMNS, ATTACHMENT_COLUMNS_MAPPING)
    const res = await this.database('attachments').returning('uid').insert(preparedPayload)
    return res[0]
  }

  async getAttachmentById(id) {
    if (!validator.isUUID(id,4)){
      return null
    }
    const res = await this.database('attachments').where('uid', id)
    let attrs = res[0]

    if (!attrs) {
      return null
    }

    attrs = this._prepareModelPayload(attrs, ATTACHMENT_FIELDS, ATTACHMENT_FIELDS_MAPPING)
    return PgAdapter.initObject(Attachment, attrs, id)
  }

  async getAttachmentsByIds(ids) {
    const responses = await this.database('attachments').whereIn('uid', ids)

    const objects = responses.map((attrs, i) => {
      if (attrs){
        attrs = this._prepareModelPayload(attrs, ATTACHMENT_FIELDS, ATTACHMENT_FIELDS_MAPPING)
      }

      return PgAdapter.initObject(Attachment, attrs, ids[i])
    })

    return objects
  }

  updateAttachment(attachmentId, payload) {
    let preparedPayload = this._prepareModelPayload(payload, ATTACHMENT_COLUMNS, ATTACHMENT_COLUMNS_MAPPING)

    return this.database('attachments').where('uid', attachmentId).update(preparedPayload)
  }


  linkAttachmentToPost(attachmentId, postId){
    let payload = {
      post_id: postId
    }
    return this.database('attachments').where('uid', attachmentId).update(payload)
  }

  unlinkAttachmentFromPost(attachmentId, postId){
    let payload = {
      post_id: null
    }
    return this.database('attachments').where('uid', attachmentId).where('post_id', postId).update(payload)
  }

  async getPostAttachments(postId) {
    const res = await this.database('attachments').select('uid').orderBy('created_at', 'asc').where('post_id', postId)
    const attrs = res.map((record)=>{
      return record.uid
    })
    return attrs
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
    return PgAdapter.initObject(Comment, attrs, id)
  }

  async getCommentsByIds(ids) {
    const responses = await this.database('comments').whereIn('uid', ids)

    const objects = responses.map((attrs, i) => {
      if (attrs){
        attrs = this._prepareModelPayload(attrs, COMMENT_FIELDS, COMMENT_FIELDS_MAPPING)
      }

      return PgAdapter.initObject(Comment, attrs, ids[i])
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
}
