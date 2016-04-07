import _ from 'lodash'
import validator from 'validator'

import { Group, User } from '../models'

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

  prepareUserPayload(payload, namesMapping, valuesMapping){
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
    let preparedPayload = this.prepareUserPayload(payload, USER_COLUMNS, USER_COLUMNS_MAPPING)
    const res = await this.database('users').returning('uid').insert(preparedPayload)
    return res[0]
  }

  updateUser(userId, payload) {
    let tokenExpirationTime = new Date(Date.now())
    const expireAfter = 60*60*24 // 24 hours

    let preparedPayload = this.prepareUserPayload(payload, USER_COLUMNS, USER_COLUMNS_MAPPING)

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

    attrs = this.prepareUserPayload(attrs, USER_FIELDS, USER_FIELDS_MAPPING)

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

    attrs = this.prepareUserPayload(attrs, USER_FIELDS, USER_FIELDS_MAPPING)

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

    attrs = this.prepareUserPayload(attrs, USER_FIELDS, USER_FIELDS_MAPPING)

    if (attrs.type === 'group') {
      return PgAdapter.initObject(Group, attrs, id)
    }

    return PgAdapter.initObject(User, attrs, id)
  }

  async getFeedOwnersByIds(ids) {
    const responses = await this.database('users').whereIn('uid', ids)

    const objects = responses.map((attrs, i) => {
      if (attrs){
        attrs = this.prepareUserPayload(attrs, USER_FIELDS, USER_FIELDS_MAPPING)
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

    attrs = this.prepareUserPayload(attrs, USER_FIELDS, USER_FIELDS_MAPPING)

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
}
