import _ from 'lodash'

import { Group, User } from '../models'

const USER_COLUMNS_MAPPING = {
  username:               "username",
  screenName:             "screen_name",
  email:                  "email",
  description:            "description",
  type:                   "type",
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

const USER_COLUMNS_REVERSE_MAPPING = {
  uid:                        "id",
  username:                   "username",
  screen_name:                "screenName",
  email:                      "email",
  description:                "description",
  type:                       "type",
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

  prepareUserPayload(payload, mapping){
    return _.transform(payload, (result, val, key) => {
      let mappedKey = mapping[key]
      if (mappedKey){
        result[mappedKey] = val
      }
    })

    // TODO: downcase email!
    // TODO: username.toLowerCase()
  }

  async createUser(payload) {
    let preparedPayload = this.prepareUserPayload(payload, USER_COLUMNS_MAPPING)
    return this.database('users').returning('uid').insert(preparedPayload)
  }

  updateUser(userId, payload) {
    let tokenExpirationTime = new Date().getTime()
    const expireAfter = 60*60*24 // 24 hours

    let preparedPayload = this.prepareUserPayload(payload, USER_COLUMNS_MAPPING)


    if (_.has(preparedPayload, 'reset_password_token')) {
      tokenExpirationTime.setHours(tokenExpirationTime.getHours() + expireAfter)
      preparedPayload['reset_password_expires_at'] = tokenExpirationTime
    }

    return this.database('users').where('uid', userId).insert(preparedPayload)
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
    let preparedEmail = this._normalizeUserEmail(email)
    const res = await this.database('users').where('email', preparedEmail).count()
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

    attrs = this.prepareUserPayload(attrs, USER_COLUMNS_REVERSE_MAPPING)

    return PgAdapter.initObject(User, attrs, attrs.id)
  }

  async getUserByEmail(email) {
    let preparedEmail = this._normalizeUserEmail(email)
    const res = await this.database('users').where('email', preparedEmail)
    let attrs = res[0]

    if (!attrs) {
      return null
    }

    if (attrs.type !== 'user') {
      throw new Error(`Expected User, got ${attrs.type}`)
    }

    attrs = this.prepareUserPayload(attrs, USER_COLUMNS_REVERSE_MAPPING)

    return PgAdapter.initObject(User, attrs, attrs.id)
  }








  async getFeedOwnerById(id) {
    const res = await this.database('users').where('uid', id)
    let attrs = res[0]

    if (!attrs) {
      return null
    }

    attrs = this.prepareUserPayload(attrs, USER_COLUMNS_REVERSE_MAPPING)

    if (attrs.type === 'group') {
      return PgAdapter.initObject(Group, attrs, id)
    }

    return PgAdapter.initObject(User, attrs, id)
  }

  async getFeedOwnersByIds(ids) {
    const responses = await this.database('users').where('uid', ids)

    const objects = responses.map((attrs, i) => {
      if (attrs){
        attrs = this.prepareUserPayload(attrs, USER_COLUMNS_REVERSE_MAPPING)
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

    attrs = this.prepareUserPayload(attrs, USER_COLUMNS_REVERSE_MAPPING)

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


  ///////////

  _normalizeUserEmail(email) {
    return email.toLowerCase()
  }
}
