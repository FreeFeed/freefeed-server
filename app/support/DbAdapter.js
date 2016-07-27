import _ from 'lodash'
import validator from 'validator'
import NodeCache from 'node-cache'
import { promisifyAll } from 'bluebird'

import { Attachment, Comment, Group, Post, Timeline, User } from '../models'

const USER_COLUMNS = {
  username:               'username',
  screenName:             'screen_name',
  email:                  'email',
  description:            'description',
  type:                   'type',
  profilePictureUuid:     'profile_picture_uuid',
  createdAt:              'created_at',
  updatedAt:              'updated_at',
  isPrivate:              'is_private',
  isRestricted:           'is_restricted',
  hashedPassword:         'hashed_password',
  resetPasswordToken:     'reset_password_token',
  resetPasswordSentAt:    'reset_password_sent_at',
  resetPasswordExpiresAt: 'reset_password_expires_at',
  frontendPreferences:    'frontend_preferences'
}

const USER_COLUMNS_MAPPING = {
  username:  (username) => {return username.toLowerCase()},
  createdAt: (timestamp) => {
    const d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  updatedAt: (timestamp) => {
    const d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  isPrivate:           (is_private) => {return is_private === '1'},
  isRestricted:        (is_restricted) => {return is_restricted === '1'},
  resetPasswordSentAt: (timestamp) => {
    const d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  }
}

const USER_FIELDS = {
  uid:                       'id',
  username:                  'username',
  screen_name:               'screenName',
  email:                     'email',
  description:               'description',
  type:                      'type',
  profile_picture_uuid:      'profilePictureUuid',
  created_at:                'createdAt',
  updated_at:                'updatedAt',
  is_private:                'isPrivate',
  is_restricted:             'isRestricted',
  hashed_password:           'hashedPassword',
  reset_password_token:      'resetPasswordToken',
  reset_password_sent_at:    'resetPasswordSentAt',
  reset_password_expires_at: 'resetPasswordExpiresAt',
  frontend_preferences:      'frontendPreferences',
  subscribed_feed_ids:       'subscribedFeedIds'
}

const USER_FIELDS_MAPPING = {
  created_at:                (time) => { return time.getTime().toString() },
  updated_at:                (time) => { return time.getTime().toString() },
  is_private:                (is_private) => {return is_private ? '1' : '0' },
  is_restricted:             (is_restricted) => {return is_restricted ? '1' : '0' },
  reset_password_sent_at:    (time) => { return time && time.getTime() },
  reset_password_expires_at: (time) => { return time && time.getTime() }
}

const USER_STATS_FIELDS = {
  posts_count:         'posts',
  likes_count:         'likes',
  comments_count:      'comments',
  subscribers_count:   'subscribers',
  subscriptions_count: 'subscriptions'
}

const ATTACHMENT_COLUMNS = {
  createdAt:     'created_at',
  updatedAt:     'updated_at',
  fileName:      'file_name',
  fileSize:      'file_size',
  mimeType:      'mime_type',
  mediaType:     'media_type',
  fileExtension: 'file_extension',
  noThumbnail:   'no_thumbnail',
  imageSizes:    'image_sizes',
  artist:        'artist',
  title:         'title',
  userId:        'user_id',
  postId:        'post_id'
}

const ATTACHMENT_COLUMNS_MAPPING = {
  createdAt: (timestamp) => {
    const d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  updatedAt: (timestamp) => {
    const d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  noThumbnail: (no_thumbnail) => {return no_thumbnail === '1'},
  fileSize:    (file_size) => {
    return parseInt(file_size, 10)
  },
  postId: (post_id) => {
    if (validator.isUUID(post_id, 4)) {
      return post_id
    }
    return null
  },
  userId: (user_id) => {
    if (validator.isUUID(user_id, 4)) {
      return user_id
    }
    return null
  }
}

const ATTACHMENT_FIELDS = {
  uid:            'id',
  created_at:     'createdAt',
  updated_at:     'updatedAt',
  file_name:      'fileName',
  file_size:      'fileSize',
  mime_type:      'mimeType',
  media_type:     'mediaType',
  file_extension: 'fileExtension',
  no_thumbnail:   'noThumbnail',
  image_sizes:    'imageSizes',
  artist:         'artist',
  title:          'title',
  user_id:        'userId',
  post_id:        'postId'
}

const ATTACHMENT_FIELDS_MAPPING = {
  created_at:   (time) => { return time.getTime().toString() },
  updated_at:   (time) => { return time.getTime().toString() },
  no_thumbnail: (no_thumbnail) => {return no_thumbnail ? '1' : '0' },
  file_size:    (file_size) => {return file_size && file_size.toString()},
  post_id:      (post_id) => {return post_id ? post_id : ''},
  user_id:      (user_id) => {return user_id ? user_id : ''}
}



const COMMENT_COLUMNS = {
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  body:      'body',
  postId:    'post_id',
  userId:    'user_id'
}

const COMMENT_COLUMNS_MAPPING = {
  createdAt: (timestamp) => {
    const d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  updatedAt: (timestamp) => {
    const d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  }
}

const COMMENT_FIELDS = {
  uid:        'id',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  body:       'body',
  user_id:    'userId',
  post_id:    'postId'
}

const COMMENT_FIELDS_MAPPING = {
  created_at: (time) => { return time.getTime().toString() },
  updated_at: (time) => { return time.getTime().toString() },
  post_id:    (post_id) => {return post_id ? post_id : ''},
  user_id:    (user_id) => {return user_id ? user_id : ''}
}


const FEED_COLUMNS = {
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  name:      'name',
  userId:    'user_id'
}

const FEED_COLUMNS_MAPPING = {
  createdAt: (timestamp) => {
    const d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  updatedAt: (timestamp) => {
    const d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  }
}

const FEED_FIELDS = {
  id:         'intId',
  uid:        'id',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  name:       'name',
  user_id:    'userId'
}

const FEED_FIELDS_MAPPING = {
  created_at: (time) => { return time.getTime().toString() },
  updated_at: (time) => { return time.getTime().toString() },
  user_id:    (user_id) => {return user_id ? user_id : ''}
}


const POST_COLUMNS = {
  createdAt:        'created_at',
  updatedAt:        'updated_at',
  userId:           'user_id',
  body:             'body',
  commentsDisabled: 'comments_disabled'
}

const POST_COLUMNS_MAPPING = {
  createdAt: (timestamp) => {
    const d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  updatedAt: (timestamp) => {
    const d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  commentsDisabled: (comments_disabled) => {return comments_disabled === '1'},
  userId:           (user_id) => {
    if (validator.isUUID(user_id, 4)) {
      return user_id
    }
    return null
  }
}

const POST_FIELDS = {
  uid:                  'id',
  created_at:           'createdAt',
  updated_at:           'updatedAt',
  user_id:              'userId',
  body:                 'body',
  comments_disabled:    'commentsDisabled',
  feed_ids:             'feedIntIds',
  destination_feed_ids: 'destinationFeedIds',
  comments_count:       'commentsCount',
  likes_count:          'likesCount'
}

const POST_FIELDS_MAPPING = {
  created_at:        (time) => { return time.getTime().toString() },
  updated_at:        (time) => { return time.getTime().toString() },
  comments_disabled: (comments_disabled) => {return comments_disabled ? '1' : '0' },
  user_id:           (user_id) => {return user_id ? user_id : ''}
}


export class DbAdapter {
  constructor(database) {
    this.database = database
    this.statsCache = promisifyAll(new NodeCache({ stdTTL: 300 }))
  }

  static initObject(classDef, attrs, id, params) {
    return new classDef({ ...attrs, ...{ id }, ...params })
  }

  ///////////////////////////////////////////////////
  // User
  ///////////////////////////////////////////////////

  _prepareModelPayload(payload, namesMapping, valuesMapping) {
    return _.transform(payload, (result, val, key) => {
      let mappedVal = val
      if (valuesMapping[key]) {
        mappedVal = valuesMapping[key](val)
      }
      const mappedKey = namesMapping[key]
      if (mappedKey) {
        result[mappedKey] = mappedVal
      }
    })
  }

  async createUser(payload) {
    const preparedPayload = this._prepareModelPayload(payload, USER_COLUMNS, USER_COLUMNS_MAPPING)
    const res = await this.database('users').returning('uid').insert(preparedPayload)
    const uid = res[0]
    await this.createUserStats(uid)
    return uid
  }

  updateUser(userId, payload) {
    const tokenExpirationTime = new Date(Date.now())
    const expireAfter = 60 * 60 * 24 // 24 hours

    const preparedPayload = this._prepareModelPayload(payload, USER_COLUMNS, USER_COLUMNS_MAPPING)

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
    const res = await this.database('users').whereRaw('LOWER(email)=LOWER(?)', email).count()
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

    _.each(users, (user) => {
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
    if (attrs.reset_password_expires_at < now) {
      return null
    }

    attrs = this._prepareModelPayload(attrs, USER_FIELDS, USER_FIELDS_MAPPING)

    return DbAdapter.initObject(User, attrs, attrs.id)
  }

  async getUserByEmail(email) {
    const res = await this.database('users').whereRaw('LOWER(email)=LOWER(?)', email)
    let attrs = res[0]

    if (!attrs) {
      return null
    }

    if (attrs.type !== 'user') {
      throw new Error(`Expected User, got ${attrs.type}`)
    }

    attrs = this._prepareModelPayload(attrs, USER_FIELDS, USER_FIELDS_MAPPING)

    return DbAdapter.initObject(User, attrs, attrs.id)
  }








  async getFeedOwnerById(id) {
    if (!validator.isUUID(id,4)) {
      return null
    }
    const res = await this.database('users').where('uid', id)
    let attrs = res[0]

    if (!attrs) {
      return null
    }

    attrs = this._prepareModelPayload(attrs, USER_FIELDS, USER_FIELDS_MAPPING)

    if (attrs.type === 'group') {
      return DbAdapter.initObject(Group, attrs, id)
    }

    return DbAdapter.initObject(User, attrs, id)
  }

  async getFeedOwnersByIds(ids) {
    const responses = await this.database('users').whereIn('uid', ids).orderByRaw(`position(uid::text in '${ids.toString()}')`)

    const objects = responses.map((attrs) => {
      if (attrs) {
        attrs = this._prepareModelPayload(attrs, USER_FIELDS, USER_FIELDS_MAPPING)
      }

      if (attrs.type === 'group') {
        return DbAdapter.initObject(Group, attrs, attrs.id)
      }

      return DbAdapter.initObject(User, attrs, attrs.id)
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
      return DbAdapter.initObject(Group, attrs, attrs.id)
    }

    return DbAdapter.initObject(User, attrs, attrs.id)
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
  // User statistics
  ///////////////////////////////////////////////////

  async createUserStats(userId) {
    const res = await this.database('user_stats').insert({ user_id: userId })
    return res
  }

  async getUserStats(userId) {
    let userStats

    // Check the cache first
    const cachedUserStats = await this.statsCache.getAsync(userId)

    if (typeof cachedUserStats != 'undefined') {
      // Cache hit
      userStats = cachedUserStats
    } else {
      // Cache miss, read from the database
      const res = await this.database('user_stats').where('user_id', userId)
      userStats = res[0]
      await this.statsCache.setAsync(userId, userStats)
    }

    return this._prepareModelPayload(userStats, USER_STATS_FIELDS, {})
  }

  async calculateUserStats(userId) {
    const userFeeds = await this.database('users').select('subscribed_feed_ids').where('uid', userId)
    const readableFeedsIds = userFeeds[0].subscribed_feed_ids

    const userPostsFeed = await this.database('feeds').returning('uid').where({
      user_id: userId,
      name:    'Posts'
    })
    const userPostsFeedId = userPostsFeed[0].uid
    const readablePostFeeds = this.database('feeds').whereIn('id', readableFeedsIds).where('name', 'Posts')

    const promises = [
      this.getUserPostsCount(userId),
      this.getUserLikesCount(userId),
      this.getUserCommentsCount(userId),
      this.getTimelineSubscribersIds(userPostsFeedId),
      readablePostFeeds
    ]
    const values = await Promise.all(promises)
    const payload = {
      posts_count:         values[0],
      likes_count:         values[1],
      comments_count:      values[2],
      subscribers_count:   values[3].length,
      subscriptions_count: values[4].length
    }

    await this.database('user_stats').where('user_id', userId).update(payload)

    // Invalidate cache
    await this.statsCache.delAsync(userId)
  }

  statsCommentCreated(authorId) {
    return this.incrementStatsCounter(authorId, 'comments_count')
  }

  statsCommentDeleted(authorId) {
    return this.decrementStatsCounter(authorId, 'comments_count')
  }

  statsLikeCreated(authorId) {
    return this.incrementStatsCounter(authorId, 'likes_count')
  }

  statsLikeDeleted(authorId) {
    return this.decrementStatsCounter(authorId, 'likes_count')
  }

  statsPostCreated(authorId) {
    return this.incrementStatsCounter(authorId, 'posts_count')
  }

  async statsPostDeleted(authorId, postId) {
    const postLikers = await this.getPostLikersIdsWithoutBannedUsers(postId, null)
    const promises = postLikers.map((id) => {
      return this.calculateUserStats(id)
    })
    await Promise.all(promises)

    if (!_.includes(postLikers, authorId)) {
      return this.decrementStatsCounter(authorId, 'posts_count')
    }
    return null
  }

  statsSubscriptionCreated(userId) {
    return this.incrementStatsCounter(userId, 'subscriptions_count')
  }

  statsSubscriptionDeleted(userId) {
    return this.decrementStatsCounter(userId, 'subscriptions_count')
  }

  statsSubscriberAdded(userId) {
    return this.incrementStatsCounter(userId, 'subscribers_count')
  }

  statsSubscriberRemoved(userId) {
    return this.decrementStatsCounter(userId, 'subscribers_count')
  }

  async incrementStatsCounter(userId, counterName) {
    await this.database.transaction(async (trx) => {
      try {
        const res = await this.database('user_stats')
          .transacting(trx).forUpdate()
          .where('user_id', userId)

        const stats = res[0]
        const val = parseInt(stats[counterName], 10) + 1

        stats[counterName] = val

        await this.database('user_stats')
          .transacting(trx)
          .where('user_id', userId)
          .update(stats)

        await trx.commit();
      } catch (e) {
        await trx.rollback();
        throw e;
      }
    });

    // Invalidate cache
    await this.statsCache.delAsync(userId)
  }

  async decrementStatsCounter(userId, counterName) {
    await this.database.transaction(async (trx) => {
      try {
        const res = await this.database('user_stats')
          .transacting(trx).forUpdate()
          .where('user_id', userId)

        const stats = res[0]
        const val = parseInt(stats[counterName]) - 1

        if (val < 0) {
          throw new Error(`Negative user stats: ${counterName} of ${userId}`);
        }

        stats[counterName] = val

        await this.database('user_stats')
          .transacting(trx)
          .where('user_id', userId)
          .update(stats)

        await trx.commit();
      } catch (e) {
        await trx.rollback();
        throw e;
      }
    });

    // Invalidate cache
    await this.statsCache.delAsync(userId)
  }

  ///////////////////////////////////////////////////
  // Subscription requests
  ///////////////////////////////////////////////////

  createSubscriptionRequest(fromUserId, toUserId) {
    const currentTime = new Date().toISOString()

    const payload = {
      from_user_id: fromUserId,
      to_user_id:   toUserId,
      created_at:   currentTime
    }

    return this.database('subscription_requests').returning('id').insert(payload)
  }

  deleteSubscriptionRequest(toUserId, fromUserId) {
    return this.database('subscription_requests').where({
      from_user_id: fromUserId,
      to_user_id:   toUserId
    }).delete()
  }

  async getUserSubscriptionRequestsIds(toUserId) {
    const res = await this.database('subscription_requests').select('from_user_id').orderBy('created_at', 'desc').where('to_user_id', toUserId)
    const attrs = res.map((record) => {
      return record.from_user_id
    })
    return attrs
  }

  async isSubscriptionRequestPresent(fromUserId, toUserId) {
    const res = await this.database('subscription_requests').where({
      from_user_id: fromUserId,
      to_user_id:   toUserId
    }).count()
    return parseInt(res[0].count) != 0
  }

  async getUserSubscriptionPendingRequestsIds(fromUserId) {
    const res = await this.database('subscription_requests').select('to_user_id').orderBy('created_at', 'desc').where('from_user_id', fromUserId)
    const attrs = res.map((record) => {
      return record.to_user_id
    })
    return attrs
  }

  ///////////////////////////////////////////////////
  // Bans
  ///////////////////////////////////////////////////

  async getUserBansIds(userId) {
    const res = await this.database('bans').select('banned_user_id').orderBy('created_at', 'desc').where('user_id', userId)
    const attrs = res.map((record) => {
      return record.banned_user_id
    })
    return attrs
  }


  async getBanMatrixByUsersForPostReader(bannersUserIds, targetUserId) {
    let res = [];

    if (targetUserId) {
      res = await this.database('bans')
        .where('banned_user_id', targetUserId)
        .where('user_id', 'in', bannersUserIds)
        .orderByRaw(`position(user_id::text in '${bannersUserIds.toString()}')`)
    }

    const matrix = bannersUserIds.map((id) => {
      const foundBan = _.find(res, (record) => {
        return record.user_id == id
      })

      return foundBan ? [id, true] : [id, false]
    })

    return matrix
  }

  createUserBan(currentUserId, bannedUserId) {
    const currentTime = new Date().toISOString()

    const payload = {
      user_id:        currentUserId,
      banned_user_id: bannedUserId,
      created_at:     currentTime
    }

    return this.database('bans').returning('id').insert(payload)
  }

  deleteUserBan(currentUserId, bannedUserId) {
    return this.database('bans').where({
      user_id:        currentUserId,
      banned_user_id: bannedUserId
    }).delete()
  }

  ///////////////////////////////////////////////////
  // Group administrators
  ///////////////////////////////////////////////////

  async getGroupAdministratorsIds(groupId) {
    const res = await this.database('group_admins').select('user_id').orderBy('created_at', 'desc').where('group_id', groupId)
    const attrs = res.map((record) => {
      return record.user_id
    })
    return attrs
  }

  addAdministratorToGroup(groupId, adminId) {
    const currentTime = new Date().toISOString()

    const payload = {
      user_id:    adminId,
      group_id:   groupId,
      created_at: currentTime
    }

    return this.database('group_admins').returning('id').insert(payload)
  }

  removeAdministratorFromGroup(groupId, adminId) {
    return this.database('group_admins').where({
      user_id:  adminId,
      group_id: groupId
    }).delete()
  }

  ///////////////////////////////////////////////////
  // Attachments
  ///////////////////////////////////////////////////

  async createAttachment(payload) {
    const preparedPayload = this._prepareModelPayload(payload, ATTACHMENT_COLUMNS, ATTACHMENT_COLUMNS_MAPPING)
    const res = await this.database('attachments').returning('uid').insert(preparedPayload)
    return res[0]
  }

  async getAttachmentById(id) {
    if (!validator.isUUID(id,4)) {
      return null
    }
    const res = await this.database('attachments').where('uid', id)
    let attrs = res[0]

    if (!attrs) {
      return null
    }

    attrs = this._prepareModelPayload(attrs, ATTACHMENT_FIELDS, ATTACHMENT_FIELDS_MAPPING)
    return DbAdapter.initObject(Attachment, attrs, id)
  }

  async getAttachmentsByIds(ids) {
    const responses = await this.database('attachments').whereIn('uid', ids).orderByRaw(`position(uid::text in '${ids.toString()}')`)

    const objects = responses.map((attrs) => {
      if (attrs) {
        attrs = this._prepareModelPayload(attrs, ATTACHMENT_FIELDS, ATTACHMENT_FIELDS_MAPPING)
      }

      return DbAdapter.initObject(Attachment, attrs, attrs.id)
    })

    return objects
  }

  updateAttachment(attachmentId, payload) {
    const preparedPayload = this._prepareModelPayload(payload, ATTACHMENT_COLUMNS, ATTACHMENT_COLUMNS_MAPPING)

    return this.database('attachments').where('uid', attachmentId).update(preparedPayload)
  }


  linkAttachmentToPost(attachmentId, postId) {
    const payload = { post_id: postId }
    return this.database('attachments').where('uid', attachmentId).update(payload)
  }

  unlinkAttachmentFromPost(attachmentId, postId) {
    const payload = { post_id: null }
    return this.database('attachments').where('uid', attachmentId).where('post_id', postId).update(payload)
  }

  async getPostAttachments(postId) {
    const res = await this.database('attachments').select('uid').orderBy('created_at', 'asc').where('post_id', postId)
    const attrs = res.map((record) => {
      return record.uid
    })
    return attrs
  }

  async getAttachmentsOfPost(postId) {
    const responses = await this.database('attachments').orderBy('created_at', 'asc').where('post_id', postId)
    const objects = responses.map((attrs) => {
      if (attrs) {
        attrs = this._prepareModelPayload(attrs, ATTACHMENT_FIELDS, ATTACHMENT_FIELDS_MAPPING)
      }

      return DbAdapter.initObject(Attachment, attrs, attrs.id)
    })

    return objects
  }

  ///////////////////////////////////////////////////
  // Likes
  ///////////////////////////////////////////////////

  createUserPostLike(postId, userId) {
    const currentTime = new Date().toISOString()

    const payload = {
      post_id:    postId,
      user_id:    userId,
      created_at: currentTime
    }

    return this.database('likes').returning('id').insert(payload)
  }

  async getPostLikesCount(postId) {
    const res = await this.database('likes').where({ post_id: postId }).count()
    return parseInt(res[0].count)
  }

  async getUserLikesCount(userId) {
    const res = await this.database('likes').where({ user_id: userId }).count()
    return parseInt(res[0].count)
  }

  async getPostLikersIdsWithoutBannedUsers(postId, viewerUserId) {
    let query = this.database('likes').select('user_id').orderBy('created_at', 'desc').where('post_id', postId);

    if (viewerUserId) {
      const subquery = this.database('bans').select('banned_user_id').where('user_id', viewerUserId)
      query = query.where('user_id', 'not in', subquery)
    }

    const res = await query;

    const userIds = res.map((record) => record.user_id)
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

    if (!record) {
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
    const preparedPayload = this._prepareModelPayload(payload, COMMENT_COLUMNS, COMMENT_COLUMNS_MAPPING)
    const res = await this.database('comments').returning('uid').insert(preparedPayload)
    return res[0]
  }

  async getCommentById(id) {
    if (!validator.isUUID(id,4)) {
      return null
    }
    const res = await this.database('comments').where('uid', id)
    let attrs = res[0]

    if (!attrs) {
      return null
    }

    attrs = this._prepareModelPayload(attrs, COMMENT_FIELDS, COMMENT_FIELDS_MAPPING)
    return DbAdapter.initObject(Comment, attrs, id)
  }

  updateComment(commentId, payload) {
    const preparedPayload = this._prepareModelPayload(payload, COMMENT_COLUMNS, COMMENT_COLUMNS_MAPPING)

    return this.database('comments').where('uid', commentId).update(preparedPayload)
  }

  deleteComment(commentId, postId) {
    return this.database('comments').where({
      uid:     commentId,
      post_id: postId
    }).delete()
  }

  async getPostCommentsCount(postId) {
    const res = await this.database('comments').where({ post_id: postId }).count()
    return parseInt(res[0].count)
  }

  async getUserCommentsCount(userId) {
    const res = await this.database('comments').where({ user_id: userId }).count()
    return parseInt(res[0].count)
  }

  async getAllPostCommentsWithoutBannedUsers(postId, viewerUserId) {
    let query = this.database('comments').orderBy('created_at', 'asc').where('post_id', postId);

    if (viewerUserId) {
      const subquery = this.database('bans').select('banned_user_id').where('user_id', viewerUserId);
      query = query.where('user_id', 'not in', subquery) ;
    }

    const responses = await query

    const objects = responses.map((attrs) => {
      if (attrs) {
        attrs = this._prepareModelPayload(attrs, COMMENT_FIELDS, COMMENT_FIELDS_MAPPING)
      }

      return DbAdapter.initObject(Comment, attrs, attrs.id)
    })

    return objects
  }

  _deletePostComments(postId) {
    return this.database('comments').where({ post_id: postId }).delete()
  }


  ///////////////////////////////////////////////////
  // Feeds
  ///////////////////////////////////////////////////

  async createTimeline(payload) {
    const preparedPayload = this._prepareModelPayload(payload, FEED_COLUMNS, FEED_COLUMNS_MAPPING)
    if (preparedPayload.name == 'MyDiscussions') {
      preparedPayload.uid = preparedPayload.user_id
    }
    const res = await this.database('feeds').returning(['id', 'uid']).insert(preparedPayload)
    return { intId: res[0].id, id: res[0].uid }
  }

  createUserTimelines(userId, timelineNames) {
    const currentTime = new Date().getTime()
    const promises = timelineNames.map((n) => {
      const payload = {
        'name':      n,
        userId,
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

    const timelines =  {
      'RiverOfNews': riverOfNews[0] && riverOfNews[0].uid,
      'Hides':       hides[0] && hides[0].uid,
      'Comments':    comments[0] && comments[0].uid,
      'Likes':       likes[0] && likes[0].uid,
      'Posts':       posts[0] && posts[0].uid
    }

    if (directs[0]) {
      timelines['Directs'] = directs[0].uid
    }

    if (myDiscussions[0]) {
      timelines['MyDiscussions'] = myDiscussions[0].uid
    }

    return timelines
  }

  async getTimelineById(id, params) {
    if (!validator.isUUID(id,4)) {
      return null
    }
    const res = await this.database('feeds').where('uid', id)
    let attrs = res[0]

    if (!attrs) {
      return null
    }

    attrs = this._prepareModelPayload(attrs, FEED_FIELDS, FEED_FIELDS_MAPPING)
    return DbAdapter.initObject(Timeline, attrs, id, params)
  }

  async getTimelineByIntId(id, params) {
    const res = await this.database('feeds').where('id', id)
    let feed = res[0]

    if (!feed) {
      return null
    }

    feed = this._prepareModelPayload(feed, FEED_FIELDS, FEED_FIELDS_MAPPING)
    return DbAdapter.initObject(Timeline, feed, feed.id, params)
  }

  async getTimelinesByIds(ids, params) {
    const responses = await this.database('feeds').whereIn('uid', ids).orderByRaw(`position(uid::text in '${ids.toString()}')`)

    const objects = responses.map((attrs) => {
      if (attrs) {
        attrs = this._prepareModelPayload(attrs, FEED_FIELDS, FEED_FIELDS_MAPPING)
      }
      return DbAdapter.initObject(Timeline, attrs, attrs.id, params)
    })
    return objects
  }

  async getTimelinesByIntIds(ids, params) {
    const responses = await this.database('feeds').whereIn('id', ids).orderByRaw(`position(id::text in '${ids.toString()}')`)

    const objects = responses.map((attrs) => {
      if (attrs) {
        attrs = this._prepareModelPayload(attrs, FEED_FIELDS, FEED_FIELDS_MAPPING)
      }
      return DbAdapter.initObject(Timeline, attrs, attrs.id, params)
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

  async getUserNamedFeed(userId, name, params) {
    const response = await this.database('feeds').returning('uid').where({
      user_id: userId,
      name
    })

    let namedFeed = response[0]

    if (!namedFeed) {
      return null
    }

    namedFeed = this._prepareModelPayload(namedFeed, FEED_FIELDS, FEED_FIELDS_MAPPING)
    return DbAdapter.initObject(Timeline, namedFeed, namedFeed.id, params)
  }

  async getUserNamedFeedsIntIds(userId, names) {
    const responses = await this.database('feeds').select('id').where('user_id', userId).where('name', 'in', names)

    const ids = responses.map((record) => {
      return record.id
    })
    return ids
  }

  async getUsersNamedFeedsIntIds(userIds, names) {
    const responses = await this.database('feeds').select('id').where('user_id', 'in', userIds).where('name', 'in', names)

    const ids = responses.map((record) => {
      return record.id
    })
    return ids
  }

  async deleteUser(uid) {
    await this.database('users').where({ uid }).delete();
  }

  ///////////////////////////////////////////////////
  // Post
  ///////////////////////////////////////////////////

  async createPost(payload, destinationsIntIds) {
    const preparedPayload = this._prepareModelPayload(payload, POST_COLUMNS, POST_COLUMNS_MAPPING)
    preparedPayload.destination_feed_ids = destinationsIntIds
    const res = await this.database('posts').returning('uid').insert(preparedPayload)
    return res[0]
  }

  updatePost(postId, payload) {
    const preparedPayload = this._prepareModelPayload(payload, POST_COLUMNS, POST_COLUMNS_MAPPING)
    return this.database('posts').where('uid', postId).update(preparedPayload)
  }

  async getPostById(id, params) {
    if (!validator.isUUID(id,4)) {
      return null
    }
    const res = await this.database('posts').where('uid', id)
    let attrs = res[0]

    if (!attrs) {
      return null
    }

    attrs = this._prepareModelPayload(attrs, POST_FIELDS, POST_FIELDS_MAPPING)
    return DbAdapter.initObject(Post, attrs, id, params)
  }

  async getPostsByIds(ids, params) {
    const responses = await this.database('posts').orderBy('updated_at', 'desc').whereIn('uid', ids)

    const objects = responses.map((attrs) => {
      if (attrs) {
        attrs = this._prepareModelPayload(attrs, POST_FIELDS, POST_FIELDS_MAPPING)
      }

      return DbAdapter.initObject(Post, attrs, attrs.id, params)
    })
    return objects
  }

  async getUserPostsCount(userId) {
    const res = await this.database('posts').where({ user_id: userId }).count()
    return parseInt(res[0].count)
  }

  setPostUpdatedAt(postId, time) {
    const d = new Date()
    d.setTime(time)
    const payload = { updated_at: d.toISOString() }
    return this.database('posts').where('uid', postId).update(payload)
  }

  async deletePost(postId) {
    await this.database('posts').where({ uid: postId }).delete()

    // TODO: delete post local bumps
    return await Promise.all([
      this._deletePostLikes(postId),
      this._deletePostComments(postId)
    ])
  }

  async createPostsUsagesInTimeline(postIds, feedIntIds) {
    const preparedPostIds = postIds.map((el) => { return `'${el}'`; })
    if (!feedIntIds || feedIntIds.length == 0 || preparedPostIds.length == 0) {
      return null
    }
    return this.database
      .raw(`UPDATE posts SET feed_ids = uniq(feed_ids + ?) WHERE uid IN (${preparedPostIds.toString()})`, [feedIntIds])
  }

  async getPostUsagesInTimelines(postId) {
    const res = await this.database('posts').where('uid', postId)
    const attrs = res[0]
    if (!attrs) {
      return []
    }

    return this.getTimelinesUUIDsByIntIds(attrs.feed_ids)
  }

  insertPostIntoFeeds(feedIntIds, postId) {
    return this.createPostsUsagesInTimeline([postId], feedIntIds)
  }

  withdrawPostFromFeeds(feedIntIds, postUUID) {
    return this.database
      .raw('UPDATE posts SET feed_ids = uniq(feed_ids - ?) WHERE uid = ?', [feedIntIds, postUUID])
  }

  async isPostPresentInTimeline(timelineId, postId) {
    const res = await this.database('posts').where('uid', postId)
    const postData = res[0]
    return _.includes(postData.feed_ids, timelineId)
  }

  async getTimelinePostsRange(timelineId, offset, limit) {
    const res = await this.database('posts').select('uid', 'updated_at').orderBy('updated_at', 'desc').offset(offset).limit(limit).whereRaw('feed_ids && ?', [[timelineId]])
    const postIds = res.map((record) => {
      return record.uid
    })
    return postIds
  }

  async getFeedsPostsRange(timelineIds, offset, limit, params) {
    const responses = await this.database('posts')
        .select('uid', 'created_at', 'updated_at', 'user_id', 'body', 'comments_disabled', 'feed_ids', 'destination_feed_ids')
        .orderBy('updated_at', 'desc')
        .offset(offset).limit(limit)
        .whereRaw('feed_ids && ?', [timelineIds]);

    const postUids = responses.map((p) => p.uid)
    const commentsCount = {}
    const likesCount = {}

    const groupedComments = await this.database('comments')
      .select('post_id', this.database.raw('count(id) as comments_count'))
      .where('post_id', 'in', postUids)
      .groupBy('post_id')

    for (const group of groupedComments) {
      if (!commentsCount[group.post_id]) {
        commentsCount[group.post_id] = 0
      }
      commentsCount[group.post_id] += parseInt(group.comments_count)
    }

    const groupedLikes = await this.database('likes')
      .select('post_id', this.database.raw('count(id) as likes_count'))
      .where('post_id', 'in', postUids)
      .groupBy('post_id')

    for (const group of groupedLikes) {
      if (!likesCount[group.post_id]) {
        likesCount[group.post_id] = 0
      }
      likesCount[group.post_id] += parseInt(group.likes_count)
    }

    const objects = responses.map((attrs) => {
      if (attrs) {
        attrs.comments_count  = commentsCount[attrs.uid] || 0
        attrs.likes_count     = likesCount[attrs.uid] || 0
        attrs = this._prepareModelPayload(attrs, POST_FIELDS, POST_FIELDS_MAPPING)
      }

      return DbAdapter.initObject(Post, attrs, attrs.id, params)
    })
    return objects
  }

  async createMergedPostsTimeline(destinationTimelineId, sourceTimelineId1, sourceTimelineId2) {
    await this.database.transaction(async (trx) => {
      try {
        await trx.raw('LOCK TABLE "posts" IN SHARE ROW EXCLUSIVE MODE');
        await trx.raw('UPDATE "posts" SET "feed_ids" = uniq("feed_ids" + ?) WHERE "feed_ids" && ?', [[destinationTimelineId], [sourceTimelineId1, sourceTimelineId2]])

        await trx.commit();
      } catch (e) {
        await trx.rollback();
        throw e;
      }
    });
  }

  async getTimelinesIntersectionPostIds(timelineId1, timelineId2) {
    const res1 = await this.database('posts').select('uid', 'updated_at').orderBy('updated_at', 'desc').whereRaw('feed_ids && ?', [[timelineId1]])
    const postIds1 = res1.map((record) => {
      return record.uid
    })

    const res2 = await this.database('posts').select('uid', 'updated_at').orderBy('updated_at', 'desc').whereRaw('feed_ids && ?', [[timelineId2]])
    const postIds2 = res2.map((record) => {
      return record.uid
    })

    return _.intersection(postIds1, postIds2)
  }

  ///////////////////////////////////////////////////
  // Subscriptions
  ///////////////////////////////////////////////////

  async getUserSubscriptionsIds(userId) {
    const res = await this.database('subscriptions').select('feed_id').orderBy('created_at', 'desc').where('user_id', userId)
    const attrs = res.map((record) => {
      return record.feed_id
    })
    return attrs
  }

  async isUserSubscribedToTimeline(currentUserId, timelineId) {
    const res = await this.database('subscriptions').where({
      feed_id: timelineId,
      user_id: currentUserId
    }).count()
    return parseInt(res[0].count) != 0
  }

  async getTimelineSubscribersIds(timelineId) {
    const res = await this.database('subscriptions').select('user_id').orderBy('created_at', 'desc').where('feed_id', timelineId)
    const attrs = res.map((record) => {
      return record.user_id
    })
    return attrs
  }

  async getTimelineSubscribers(timelineIntId) {
    const responses = this.database('users').whereRaw('subscribed_feed_ids && ?', [[timelineIntId]])
    const objects = responses.map((attrs) => {
      if (attrs) {
        attrs = this._prepareModelPayload(attrs, USER_FIELDS, USER_FIELDS_MAPPING)
      }

      if (attrs.type === 'group') {
        return DbAdapter.initObject(Group, attrs, attrs.id)
      }

      return DbAdapter.initObject(User, attrs, attrs.id)
    })

    return objects
  }

  async subscribeUserToTimelines(timelineIds, currentUserId) {
    const subsPromises = timelineIds.map((id) => {
      const currentTime = new Date().toISOString()

      const payload = {
        feed_id:    id,
        user_id:    currentUserId,
        created_at: currentTime
      }
      return this.database('subscriptions').returning('id').insert(payload)
    })
    await Promise.all(subsPromises)

    const feedIntIds = await this.getTimelinesIntIdsByUUIDs(timelineIds)

    const res = await this.database
      .raw('UPDATE users SET subscribed_feed_ids = uniq(subscribed_feed_ids + ?) WHERE uid = ? RETURNING subscribed_feed_ids', [feedIntIds, currentUserId])

    return res.rows[0].subscribed_feed_ids
  }

  async unsubscribeUserFromTimelines(timelineIds, currentUserId) {
    const unsubsPromises = timelineIds.map((id) => {
      return this.database('subscriptions').where({
        feed_id: id,
        user_id: currentUserId
      }).delete()
    })
    await Promise.all(unsubsPromises)

    const feedIntIds = await this.getTimelinesIntIdsByUUIDs(timelineIds)

    const res = await this.database
      .raw('UPDATE users SET subscribed_feed_ids = uniq(subscribed_feed_ids - ?) WHERE uid = ? RETURNING subscribed_feed_ids', [feedIntIds, currentUserId])
    return res.rows[0].subscribed_feed_ids
  }

  ///////////////////////////////////////////////////
  // LocalBumps
  ///////////////////////////////////////////////////

  async createLocalBump(postId, userId) {
    const existingPostLocalBumps = await this.database('local_bumps').where({
      post_id: postId,
      user_id: userId
    }).count()
    if (parseInt(existingPostLocalBumps[0].count) > 0) {
      return true
    }

    const payload = {
      post_id: postId,
      user_id: userId
    }

    return this.database('local_bumps').returning('id').insert(payload)
  }

  async getUserLocalBumps(userId, newerThan) {
    const time = new Date()
    if (newerThan) {
      time.setTime(newerThan)
    }

    const res = await this.database('local_bumps').orderBy('created_at', 'desc').where('user_id', userId).where('created_at', '>', time.toISOString())
    const bumps = res.map((record) => {
      return {
        postId:   record.post_id,
        bumpedAt: record.created_at.getTime()
      }
    })
    return bumps
  }


  ///////////////////////////////////////////////////
  // Search
  ///////////////////////////////////////////////////

  async searchPosts(query, currentUserId, visibleFeedIds, bannedUserIds) {
    const textSearchConfigName = this.database.client.config.textSearchConfigName
    const bannedUsersFilter = this._getPostsFromBannedUsersSearchFilterCondition(bannedUserIds)
    const searchCondition = this._getTextSearchCondition(query, textSearchConfigName)

    const res = await this.database.raw(
      'select * from (' +
        'select "posts".* from "posts" ' +
        'inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' ' +
        'inner join "users" on feeds.user_id=users.uid and users.is_private=false ' +
        `where ${searchCondition} ${bannedUsersFilter}` +
      'union ' +
        'select "posts".* from "posts" ' +
        `where "posts"."user_id" = '${currentUserId}' and ${searchCondition}` +
      'union ' +
        'select "posts".* from "posts" ' +
        'inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' ' +
        'inner join "users" on feeds.user_id=users.uid and users.is_private=true ' +
        `where ${searchCondition} and "feeds"."id" in (${visibleFeedIds}) ${bannedUsersFilter}` +
      ') as found_posts ' +
      'order by found_posts.updated_at desc'
    )
    return res.rows
  }

  async searchUserPosts(query, targetUserId, visibleFeedIds, bannedUserIds) {
    const textSearchConfigName = this.database.client.config.textSearchConfigName
    const bannedUsersFilter = this._getPostsFromBannedUsersSearchFilterCondition(bannedUserIds)
    const searchCondition = this._getTextSearchCondition(query, textSearchConfigName)

    const res = await this.database.raw(
      'select * from (' +
        'select "posts".* from "posts" ' +
        'inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' ' +
        'inner join "users" on feeds.user_id=users.uid and users.is_private=false ' +
        `where ${searchCondition} ${bannedUsersFilter}` +
      'union ' +
        'select "posts".* from "posts" ' +
        'inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' ' +
        'inner join "users" on feeds.user_id=users.uid and users.is_private=true ' +
        `where ${searchCondition} and "feeds"."id" in (${visibleFeedIds}) ${bannedUsersFilter}` +
      ') as found_posts ' +
      `where found_posts.user_id='${targetUserId}' ` +
      'order by found_posts.updated_at desc'
    )
    return res.rows
  }

  async searchGroupPosts(query, groupFeedId, visibleFeedIds, bannedUserIds) {
    const textSearchConfigName = this.database.client.config.textSearchConfigName
    const bannedUsersFilter = this._getPostsFromBannedUsersSearchFilterCondition(bannedUserIds)
    const searchCondition = this._getTextSearchCondition(query, textSearchConfigName)

    const res = await this.database.raw(
      'select * from (' +
        'select "posts".* from "posts" ' +
        `inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' and feeds.uid='${groupFeedId}' ` +
        'inner join "users" on feeds.user_id=users.uid and users.is_private=false ' +
        `where ${searchCondition} ${bannedUsersFilter}` +
      'union ' +
        'select "posts".* from "posts" ' +
        `inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' and feeds.uid='${groupFeedId}' ` +
        'inner join "users" on feeds.user_id=users.uid and users.is_private=true ' +
        `where ${searchCondition} and "feeds"."id" in (${visibleFeedIds}) ${bannedUsersFilter}` +
      ') as found_posts ' +
      'order by found_posts.updated_at desc'
    )
    return res.rows
  }

  initRawPosts(rawPosts, params) {
    const objects = rawPosts.map((attrs) => {
      if (attrs) {
        attrs = this._prepareModelPayload(attrs, POST_FIELDS, POST_FIELDS_MAPPING)
      }

      return DbAdapter.initObject(Post, attrs, attrs.id, params)
    })
    return objects
  }

  _getPostsFromBannedUsersSearchFilterCondition(bannedUserIds) {
    let bannedUsersFilter = ''

    if (bannedUserIds.length > 0) {
      const bannedUserIdsString = bannedUserIds.map((uid) => `'${uid}'`).join(',')
      bannedUsersFilter = `and posts.user_id not in (${bannedUserIdsString}) `
    }
    return bannedUsersFilter
  }

  _getTextSearchCondition(parsedQuery, textSearchConfigName) {
    const searchConditions = []
    if (parsedQuery.query.length > 2) {
      searchConditions.push(`to_tsvector('${textSearchConfigName}', posts.body) @@ to_tsquery('${parsedQuery.query}')`)
    }
    if (parsedQuery.quotes.length > 0) {
      const quoteConditions = parsedQuery.quotes.map((quote) => `posts.body ~ '${quote}'`)
      searchConditions.push(`${quoteConditions.join(' and ')}`)
    }

    if (parsedQuery.hashtags.length > 0) {
      const hashtagConditions = parsedQuery.hashtags.map((tag) => {
        return `posts.uid in (
            select u.post_id from hashtag_usages as u where u.hashtag_id in (
              select hashtags.id from hashtags where hashtags.name = '${tag}'
            )
          )`
      })

      searchConditions.push(`${hashtagConditions.join(' and ')}`)
    }

    if (searchConditions.length == 0) {
      return ' 1=0 '
    }

    return `${searchConditions.join(' and ')} `
  }


  ///////////////////////////////////////////////////
  // Hashtags
  ///////////////////////////////////////////////////

  async getHashtagIdsByNames(names) {
    if (!names || names.length == 0) {
      return []
    }
    const res = await this.database('hashtags').select('id', 'name').where('name', 'in', names)
    return res.map((t) => t.id)
  }

  async getOrCreateHashtagIdsByNames(names) {
    if (!names || names.length == 0) {
      return []
    }
    const targetTagNames   = _.sortBy(names)
    const existingTags     = await this.database('hashtags').select('id', 'name').where('name', 'in', targetTagNames)
    const existingTagNames = _.sortBy(existingTags.map((t) => t.name))

    const nonExistingTagNames = _.difference(targetTagNames, existingTagNames)
    let tags = existingTags.map((t) => t.id)
    if (nonExistingTagNames.length > 0) {
      const createdTags = await this.createHashtags(nonExistingTagNames)
      if (createdTags.length > 0) {
        tags = tags.concat(createdTags)
      }
    }
    return tags
  }

  getPostHashtags(postId) {
    return this.database.select('hashtags.id', 'hashtags.name').from('hashtags')
      .join('hashtag_usages', { 'hashtag_usages.hashtag_id': 'hashtags.id' })
      .where('hashtag_usages.post_id', '=', postId)
  }

  async createHashtags(names) {
    if (!names || names.length == 0) {
      return []
    }
    const payload = names.map((name) => {
      return `('${name}')`
    }).join(',')
    const res = await this.database.raw(`insert into hashtags ("name") values ${payload} on conflict do nothing returning "id" `)
    return res.rows.map((t) => t.id)
  }

  linkHashtags(tagIds, postId) {
    if (tagIds.length == 0) {
      return false
    }
    const payload = tagIds.map((hashtagId) => {
      return `(${hashtagId}, '${postId}')`
    }).join(',')

    return this.database.raw(`insert into hashtag_usages ("hashtag_id", "post_id") values ${payload} on conflict do nothing`)
  }

  unlinkHashtags(tagIds, postId) {
    if (tagIds.length == 0) {
      return false
    }
    return this.database('hashtag_usages').where('hashtag_id', 'in', tagIds).where('post_id', postId).del()
  }

  async linkHashtagsByNames(names, postId) {
    if (!names || names.length == 0) {
      return false
    }
    const hashtagIds = await this.getOrCreateHashtagIdsByNames(names)
    if (!hashtagIds || hashtagIds.length == 0) {
      return false
    }
    return this.linkHashtags(hashtagIds, postId)
  }

  async unlinkHashtagsByNames(names, postId) {
    if (!names || names.length == 0) {
      return false
    }
    const hashtagIds = await this.getHashtagIdsByNames(names)
    if (!hashtagIds || hashtagIds.length == 0) {
      return false
    }
    return this.unlinkHashtags(hashtagIds, postId)
  }
}
