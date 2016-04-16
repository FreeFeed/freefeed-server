import _ from 'lodash'
import validator from 'validator'

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


const FEED_COLUMNS = {
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

const FEED_FIELDS = {
  uid:                    "id",
  created_at:             "createdAt",
  updated_at:             "updatedAt",
  name:                   "name",
  user_id:                "userId"
}

const FEED_FIELDS_MAPPING = {
  created_at:                 (time)=>{ return time.getTime() },
  updated_at:                 (time)=>{ return time.getTime() },
  user_id:                    (user_id)=> {return user_id ? user_id : ''}
}


const POST_COLUMNS = {
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

const POST_FIELDS = {
  uid:                    "id",
  created_at:             "createdAt",
  updated_at:             "updatedAt",
  user_id:                "userId",
  body:                   "body",
  comments_disabled:      "commentsDisabled"
}

const POST_FIELDS_MAPPING = {
  created_at:                 (time)=>{ return time.getTime() },
  updated_at:                 (time)=>{ return time.getTime() },
  comments_disabled:          (comments_disabled)=>{return comments_disabled ? '1' : '0' },
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

    return user
  }

  async getUsersByIds(userIds) {
    const users = await this.getFeedOwnersByIds(userIds)

    return users
  }

  async getUserByUsername(username) {
    const feed = await this.getFeedOwnerByUsername(username)

    if (null === feed) {
      return null
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

    return attrs
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

    return attrs
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

    return attrs
  }

  async getFeedOwnersByIds(ids) {
    const responses = await this.database('users').whereIn('uid', ids).orderByRaw(`position(uid::text in '${ids.toString()}')`)

    const objects = responses.map((attrs) => {
      if (attrs){
        attrs = this._prepareModelPayload(attrs, USER_FIELDS, USER_FIELDS_MAPPING)
      }

      return attrs
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

    return attrs
  }





  async getGroupById(id) {
    const user = await this.getFeedOwnerById(id)

    if (!user) {
      return null
    }

    return user
  }

  async getGroupByUsername(username) {
    const feed = await this.getFeedOwnerByUsername(username)

    if (null === feed) {
      return null
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
    return attrs
  }

  async getAttachmentsByIds(ids) {
    const responses = await this.database('attachments').whereIn('uid', ids).orderByRaw(`position(uid::text in '${ids.toString()}')`)

    const objects = responses.map((attrs) => {
      if (attrs){
        attrs = this._prepareModelPayload(attrs, ATTACHMENT_FIELDS, ATTACHMENT_FIELDS_MAPPING)
      }

      return attrs
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

  createUserTimelines(userId, timelineNames) {
    const currentTime = new Date().getTime()
    let promises = timelineNames.map((n) => {
      const payload = {
        'name':      n,
        'userId':    userId,
        'createdAt': currentTime.toString(),
        'updatedAt': currentTime.toString()
      }
      return this.createTimeline(payload)
    })
    return Promise.all(promises)
  }

  async getUserTimelinesIds(userId) {
    const res = await this.database('feeds').where('user_id', userId)
    const riverOfNews   = _.filter(res, (record) => { return record.name == 'RiverOfNews'})
    const hides         = _.filter(res, (record) => { return record.name == 'Hides'})
    const comments      = _.filter(res, (record) => { return record.name == 'Comments'})
    const likes         = _.filter(res, (record) => { return record.name == 'Likes'})
    const posts         = _.filter(res, (record) => { return record.name == 'Posts'})
    const directs       = _.filter(res, (record) => { return record.name == 'Directs'})
    const myDiscussions = _.filter(res, (record) => { return record.name == 'MyDiscussions'})

    let timelines =  {
      'RiverOfNews':   riverOfNews[0] && riverOfNews[0].uid,
      'Hides':         hides[0] && hides[0].uid,
      'Comments':      comments[0] && comments[0].uid,
      'Likes':         likes[0] && likes[0].uid,
      'Posts':         posts[0] && posts[0].uid
    }

    if(directs[0]){
      timelines['Directs'] = directs[0].uid
    }

    if(myDiscussions[0]){
      timelines['MyDiscussions'] = myDiscussions[0].uid
    }

    return timelines
  }

  async getTimelineById(id, params) {
    if (!validator.isUUID(id,4)){
      return null
    }
    const res = await this.database('feeds').where('uid', id)
    let attrs = res[0]

    if (!attrs) {
      return null
    }

    attrs = this._prepareModelPayload(attrs, FEED_FIELDS, FEED_FIELDS_MAPPING)
    return attrs
  }

  async getTimelinesByIds(ids, params) {
    const responses = await this.database('feeds').whereIn('uid', ids).orderByRaw(`position(uid::text in '${ids.toString()}')`)

    const objects = responses.map((attrs) => {
      if (attrs){
        attrs = this._prepareModelPayload(attrs, FEED_FIELDS, FEED_FIELDS_MAPPING)
      }
      return attrs
    })
    return objects
  }

  async getTimelinesIntIdsByUUIDs(uuids) {
    const responses = await this.database('feeds').select('id').whereIn('uid', uuids)

    const ids = responses.map((record) => {
      return record.id
    })
    return ids
  }

  async getTimelinesUUIDsByIntIds(ids) {
    const responses = await this.database('feeds').select('uid').whereIn('id', ids)

    const uuids = responses.map((record) => {
      return record.uid
    })
    return uuids
  }

  ///////////////////////////////////////////////////
  // Post
  ///////////////////////////////////////////////////

  async createPost(payload, destinations) {
    let preparedPayload = this._prepareModelPayload(payload, POST_COLUMNS, POST_COLUMNS_MAPPING)
    let destTimelineIntIds = await this.getTimelinesIntIdsByUUIDs(destinations)
    preparedPayload.destination_feed_ids = destTimelineIntIds
    const res = await this.database('posts').returning('uid').insert(preparedPayload)
    return res[0]
  }

  updatePost(postId, payload) {
    let preparedPayload = this._prepareModelPayload(payload, POST_COLUMNS, POST_COLUMNS_MAPPING)
    return this.database('posts').where('uid', postId).update(preparedPayload)
  }

  async getPostById(id, params) {
    if (!validator.isUUID(id,4)){
      return null
    }
    const res = await this.database('posts').where('uid', id)
    let attrs = res[0]

    if (!attrs) {
      return null
    }

    attrs = this._prepareModelPayload(attrs, POST_FIELDS, POST_FIELDS_MAPPING)
    return attrs
  }

  async getPostsByIds(ids, params) {
    const responses = await this.database('posts').orderBy('updated_at', 'desc').whereIn('uid', ids)

    const objects = responses.map((attrs) => {
      if (attrs){
        attrs = this._prepareModelPayload(attrs, POST_FIELDS, POST_FIELDS_MAPPING)
      }

      return attrs
    })
    return objects
  }

  async getUserPostsCount(userId){
    const res = await this.database('posts').where({ user_id: userId }).count()
    return parseInt(res[0].count)
  }

  setPostUpdatedAt(postId, time) {
    let d = new Date()
    d.setTime(time)
    let payload = {
      updated_at: d.toISOString()
    }
    return this.database('posts').where('uid', postId).update(payload)
  }

  async deletePost(postId) {
    await this.database('posts').where({
      uid: postId
    }).delete()


    //TODO: delete post local bumps
    return await Promise.all([
      this._deletePostLikes(postId),
      this._deletePostComments(postId)
    ])
  }

  async getPostPostedToIds(postId) {
    const res = await this.database('posts').where('uid', postId)
    const post = res[0]

    if (!post) {
      return []
    }

    const destIntIds = post.destination_feed_ids
    const destUUIDs = await this.getTimelinesUUIDsByIntIds(destIntIds)
    return destUUIDs
  }

  async createPostsUsagesInTimeline(postIds, timelineUUID) {
    const feedIntId = (await this.getTimelinesIntIdsByUUIDs([timelineUUID]))[0]
    let preparedPostIds = postIds.map((el)=>{ return "'" + el + "'"; })
    if ( !feedIntId || preparedPostIds.length == 0 ) {
      return null
    }
    return this.database
      .raw(`UPDATE posts SET feed_ids = uniq(feed_ids + ?) WHERE uid IN (${preparedPostIds.toString()})`, [[feedIntId]])
  }

  async getPostUsagesInTimelines(postId) {
    const res = await this.database('posts').where('uid', postId)
    let attrs = res[0]
    if (!attrs){
      return []
    }

    return this.getTimelinesUUIDsByIntIds(attrs.feed_ids)
  }

  insertPostIntoTimeline(timelineId, postId){
    return this.createPostsUsagesInTimeline([postId], timelineId)
  }

  async withdrawPostFromTimeline(timelineUUID, postUUID){
    const feedIntId = (await this.getTimelinesIntIdsByUUIDs([timelineUUID]))[0]

    return this.database
      .raw('UPDATE posts SET feed_ids = uniq(feed_ids - ?) WHERE uid = ?', [[feedIntId], postUUID])
  }

  async isPostPresentInTimeline(timelineId, postId) {
    let postUsages = await this.getPostUsagesInTimelines(postId)
    return _.includes(postUsages, timelineId)
  }

  async getTimelinePostsRange(timelineId, offset, limit) {
    const feedIntId = (await this.getTimelinesIntIdsByUUIDs([timelineId]))[0]
    let res = await this.database('posts').select('uid', 'updated_at').orderBy('updated_at', 'desc').offset(offset).limit(limit).whereRaw('feed_ids && ?', [[feedIntId]])
    let postIds = res.map((record)=>{
      return record.uid
    })
    return postIds
  }

  async createMergedPostsTimeline(destinationTimelineId, sourceTimelineId1, sourceTimelineId2) {
    const srcFeed1IntId = (await this.getTimelinesIntIdsByUUIDs([sourceTimelineId1]))[0]
    const srcFeed2IntId = (await this.getTimelinesIntIdsByUUIDs([sourceTimelineId2]))[0]
    const destFeedIntId = (await this.getTimelinesIntIdsByUUIDs([destinationTimelineId]))[0]

    await this.database
      .raw('UPDATE posts SET feed_ids = uniq(feed_ids + ?) WHERE feed_ids && ?', [[destFeedIntId], [srcFeed1IntId, srcFeed2IntId]])
  }

  async getTimelinesIntersectionPostIds(timelineId1, timelineId2) {
    const feed1IntId = (await this.getTimelinesIntIdsByUUIDs([timelineId1]))[0]
    const feed2IntId = (await this.getTimelinesIntIdsByUUIDs([timelineId2]))[0]

    let res1 = await this.database('posts').select('uid', 'updated_at').orderBy('updated_at', 'desc').whereRaw('feed_ids && ?', [[feed1IntId]])
    let postIds1 = res1.map((record)=>{
      return record.uid
    })

    let res2 = await this.database('posts').select('uid', 'updated_at').orderBy('updated_at', 'desc').whereRaw('feed_ids && ?', [[feed2IntId]])
    let postIds2 = res2.map((record)=>{
      return record.uid
    })

    return _.intersection(postIds1, postIds2)
  }

  ///////////////////////////////////////////////////
  // Subscriptions
  ///////////////////////////////////////////////////

  async getUserSubscriptionsIds(userId) {
    const res = await this.database('subscriptions').select('feed_id').orderBy('created_at', 'desc').where('user_id', userId)
    const attrs = res.map((record)=>{
      return record.feed_id
    })
    return attrs
  }

  async isUserSubscribedToTimeline(currentUserId, timelineId){
    const res = await this.database('subscriptions').where({
      feed_id: timelineId,
      user_id: currentUserId
    }).count()
    return parseInt(res[0].count) != 0
  }

  async getTimelineSubscribers(timelineId) {
    const res = await this.database('subscriptions').select('user_id').orderBy('created_at', 'desc').where('feed_id', timelineId)
    const attrs = res.map((record)=>{
      return record.user_id
    })
    return attrs
  }

  async subscribeUserToTimeline(timelineId, currentUserId){
    const currentTime = new Date().toISOString()

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

  async unsubscribeUserFromTimeline(timelineId, currentUserId){
    await this.database('subscriptions').where({
      feed_id: timelineId,
      user_id: currentUserId
    }).delete()

    let feedIntId = (await this.getTimelinesIntIdsByUUIDs([timelineId]))[0]

    return this.database
      .raw('UPDATE users SET subscribed_feed_ids = uniq(subscribed_feed_ids - ?) WHERE uid = ?', [[feedIntId], currentUserId])
  }

  ///////////////////////////////////////////////////
  // LocalBumps
  ///////////////////////////////////////////////////

  async createLocalBump(postId, userId) {
    //console.log("createLocalBump", postId, userId)
    const existingPostLocalBumps = await this.database('local_bumps').where({
      post_id: postId,
      user_id: userId
    }).count()
    //console.log("createLocalBump bump already exist", existingPostLocalBumps)
    if (parseInt(existingPostLocalBumps[0].count) > 0){
      return true
    }

    const payload = {
      post_id: postId,
      user_id: userId
    }

    return this.database('local_bumps').returning('id').insert(payload)
  }

  async getUserLocalBumps(userId, newerThan) {
    //console.log(await this.database('local_bumps').select())
    let time = new Date()
    if (newerThan){
      time.setTime(newerThan)
    }

    const res = await this.database('local_bumps').orderBy('created_at', 'desc').where('user_id', userId).where('created_at', '>', time.toISOString())
    let bumps = res.map((record)=>{
      return {
        postId: record.post_id,
        bumpedAt: record.created_at.getTime()
      }
    })
    //console.log("getUserLocalBumps", userId, time.toISOString(), bumps)
    return bumps
  }
}
