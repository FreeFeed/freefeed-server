import _ from 'lodash'
import validator from 'validator'
import NodeCache from 'node-cache'
import redis from 'redis'
import cacheManager from 'cache-manager'
import redisStore from 'cache-manager-redis'
import pgFormat from 'pg-format';
import { promisifyAll } from 'bluebird'

import { load as configLoader } from '../../config/config'

import { Attachment, Comment, Group, Post, Timeline, User } from '../models'

promisifyAll(redis.RedisClient.prototype);
promisifyAll(redis.Multi.prototype);

const unexistedUID = '00000000-0000-0000-C000-000000000046';

const USER_COLUMNS = {
  username:               'username',
  screenName:             'screen_name',
  email:                  'email',
  description:            'description',
  type:                   'type',
  profilePictureUuid:     'profile_picture_uuid',
  createdAt:              'created_at',
  updatedAt:              'updated_at',
  directsReadAt:          'directs_read_at',
  isPrivate:              'is_private',
  isProtected:            'is_protected',
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
  directsReadAt: (timestamp) => {
    const d = new Date()
    d.setTime(timestamp)
    return d.toISOString()
  },
  isPrivate:           (is_private) => {return is_private === '1'},
  isProtected:         (is_protected) => {return is_protected === '1'},
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
  directs_read_at:           'directsReadAt',
  is_private:                'isPrivate',
  is_protected:              'isProtected',
  is_restricted:             'isRestricted',
  hashed_password:           'hashedPassword',
  reset_password_token:      'resetPasswordToken',
  reset_password_sent_at:    'resetPasswordSentAt',
  reset_password_expires_at: 'resetPasswordExpiresAt',
  frontend_preferences:      'frontendPreferences',
  subscribed_feed_ids:       'subscribedFeedIds',
  private_meta:              'privateMeta'
};

const USER_FIELDS_MAPPING = {
  created_at:                (time) => { return time.getTime().toString() },
  updated_at:                (time) => { return time.getTime().toString() },
  is_private:                (is_private) => {return is_private ? '1' : '0' },
  is_protected:              (is_protected) => {return is_protected ? '1' : '0' },
  is_restricted:             (is_restricted) => {return is_restricted ? '1' : '0' },
  reset_password_sent_at:    (time) => { return time && time.getTime() },
  reset_password_expires_at: (time) => { return time && time.getTime() },
  private_meta:              (data) => data || {}
};

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
  commentsDisabled: 'comments_disabled',
  isPrivate:        'is_private',
  isProtected:      'is_protected',
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
  },
  isPrivate:   (is_private) => {return is_private === '1'},
  isProtected: (is_protected) => {return is_protected === '1'},
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
  likes_count:          'likesCount',
  is_private:           'isPrivate',
  is_protected:         'isProtected',
}

const POST_FIELDS_MAPPING = {
  created_at:        (time) => { return time.getTime().toString() },
  updated_at:        (time) => { return time.getTime().toString() },
  comments_disabled: (comments_disabled) => {return comments_disabled ? '1' : '0' },
  user_id:           (user_id) => {return user_id ? user_id : ''},
  is_private:        (is_private) => {return is_private ? '1' : '0' },
  is_protected:      (is_protected) => {return is_protected ? '1' : '0' },
}

export class DbAdapter {
  constructor(database) {
    this.database = database
    this.statsCache = promisifyAll(new NodeCache({ stdTTL: 300 }))

    const config = configLoader()

    const CACHE_TTL = 60 * 60 * 24 // 24 hours

    this.memoryCache = cacheManager.caching({ store: 'memory', max: 5000, ttl: CACHE_TTL })
    this.cache = cacheManager.caching({ store: redisStore, host: config.redis.host, port: config.redis.port, ttl: CACHE_TTL })

    promisifyAll(this.cache)
    promisifyAll(this.memoryCache)
    promisifyAll(this.cache.store)
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

  initUserObject = (attrs) => {
    if (!attrs) {
      return null;
    }
    attrs = this._prepareModelPayload(attrs, USER_FIELDS, USER_FIELDS_MAPPING)
    return DbAdapter.initObject(attrs.type === 'group' ? Group : User, attrs, attrs.id)
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

    this.cacheFlushUser(userId)
    return this.database('users').where('uid', userId).update(preparedPayload)
  }

  setUpdatedAtInGroupsByIds = async (groupIds, time) => {
    const updatedAt = new Date();
    updatedAt.setTime(time);

    const sql = pgFormat(`UPDATE "users" SET "updated_at" = ? WHERE "uid" IN (%L) AND "type"='group' RETURNING "uid"`, groupIds);
    const uids = await this.database.raw(sql, [updatedAt.toISOString()]);

    const flushPromises = uids.rows.map((row) => this.cacheFlushUser(row.uid));
    await Promise.all(flushPromises);
  };

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
    const attrs = await this.database('users').first().where('reset_password_token', token)

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

    return this.initUserObject(attrs);
  }

  async getUserByEmail(email) {
    const attrs = await this.database('users').first().whereRaw('LOWER(email)=LOWER(?)', email)

    if (!attrs) {
      return null
    }

    if (attrs.type !== 'user') {
      throw new Error(`Expected User, got ${attrs.type}`)
    }

    return this.initUserObject(attrs);
  }

  async getFeedOwnerById(id) {
    if (!validator.isUUID(id, 4)) {
      return null
    }
    return this.initUserObject(await this.fetchUser(id));
  }

  async getFeedOwnersByIds(ids) {
    return (await this.fetchUsers(ids)).map(this.initUserObject);
  }

  async getUsersByIdsAssoc(ids) {
    return _.mapValues(await this.fetchUsersAssoc(ids), this.initUserObject);
  }

  async getFeedOwnerByUsername(username) {
    const attrs = await this.database('users').first().where('username', username.toLowerCase())
    return this.initUserObject(attrs);
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

  async getUserSubscribersIds(userId) {
    return await this.database
      .pluck('s.user_id')
      .from('subscriptions as s')
      .innerJoin('feeds as f', 'f.uid', 's.feed_id')
      .where('f.name', 'Posts')
      .where('f.user_id', userId)
      .orderBy('s.created_at', 'desc');
  }

  ///////////////////////////////////////////////////
  // User's attributes caching
  ///////////////////////////////////////////////////

  async cacheFlushUser(id) {
    const cacheKey = `user_${id}`
    await this.cache.delAsync(cacheKey)
  }

  fixDateType = (date) => {
    if (_.isString(date)) {
      return new Date(date);
    }

    if (_.isDate(date)) {
      return date;
    }

    return null;
  };

  fixCachedUserAttrs = (attrs) => {
    if (!attrs) {
      return null;
    }
    // Convert dates back to the Date type
    attrs['created_at'] = this.fixDateType(attrs['created_at']);
    attrs['updated_at'] = this.fixDateType(attrs['updated_at']);
    attrs['reset_password_sent_at'] = this.fixDateType(attrs['reset_password_sent_at']);
    attrs['reset_password_expires_at'] = this.fixDateType(attrs['reset_password_expires_at']);
    return attrs;
  };

  getCachedUserAttrs = async (id) => {
    return this.fixCachedUserAttrs(await this.cache.get(`user_${id}`))
  };

  async fetchUser(id) {
    let attrs = await this.getCachedUserAttrs(id);
    if (!attrs) {
      // Cache miss, read from the database
      attrs = await this.database('users').first().where('uid', id) || null;
      if (attrs) {
        await this.cache.set(`user_${id}`, attrs);
      }
    }
    return attrs;
  }

  /**
   * Returns plain object with ids as keys and user attributes as values
   */
  async fetchUsersAssoc(ids) {
    const idToUser = {};
    if (_.isEmpty(ids)) {
      return idToUser;
    }
    const uniqIds = _.uniq(ids);
    let cachedUsers;
    if (this.cache.store.name === 'redis') {
      const { client, done } = await this.cache.store.getClientAsync();
      try {
        const cacheKeys = ids.map((id) => `user_${id}`);
        const result = await client.mgetAsync(cacheKeys);
        cachedUsers = result.map((x) => x ? JSON.parse(x) : null).map(this.fixCachedUserAttrs);
      } finally {
        done();
      }
    } else {
      cachedUsers = await Promise.all(uniqIds.map(this.getCachedUserAttrs));
    }

    const notFoundIds = _.compact(cachedUsers.map((attrs, i) => attrs ? null : uniqIds[i]));
    const dbUsers = notFoundIds.length === 0 ? [] : await this.database('users').whereIn('uid', notFoundIds);

    await Promise.all(dbUsers.map((attrs) => this.cache.set(`user_${attrs.uid}`, attrs)));

    _.compact(cachedUsers).forEach((attrs) => idToUser[attrs.uid] = attrs);
    dbUsers.forEach((attrs) => idToUser[attrs.uid] = attrs);
    return idToUser;
  }

  async fetchUsers(ids) {
    const idToUser = await this.fetchUsersAssoc(ids);
    return ids.map((id) => idToUser[id] || null);
  }

  async someUsersArePublic(userIds, anonymousFriendly) {
    const anonymousCondition = anonymousFriendly ? 'AND not "is_protected"' : '';
    const q = pgFormat(`SELECT COUNT("id") AS "cnt" FROM "users" WHERE not "is_private" ${anonymousCondition} AND "uid" IN (%L)`, userIds);
    const res = await this.database.raw(q);
    return res.rows[0].cnt > 0;
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

  /**
   * Returns plain object with user ids as keys and user stats as values
   */
  async getUsersStatsAssoc(ids) {
    const idToStat = {};
    if (_.isEmpty(ids)) {
      return idToStat;
    }
    const uniqIds = _.compact(_.uniq(ids));
    const cachedStats = await Promise.all(uniqIds.map((id) => this.statsCache.getAsync(id)));

    const notFoundIds = _.compact(cachedStats.map((stat, i) => stat ? null : uniqIds[i]));
    const dbStats = notFoundIds.length === 0 ? [] : await this.database('user_stats').whereIn('user_id', notFoundIds);

    await Promise.all(dbStats.map((stat) => this.statsCache.setAsync(stat.user_id, stat)));

    _.compact(cachedStats).forEach((stat) => idToStat[stat.user_id] = this._prepareModelPayload(stat, USER_STATS_FIELDS, {}));
    dbStats.forEach((stat) => idToStat[stat.user_id] = this._prepareModelPayload(stat, USER_STATS_FIELDS, {}));
    return idToStat;
  }

  async calculateUserStats(userId) {
    const userFeeds = await this.database('users').select('subscribed_feed_ids').where('uid', userId)
    const readableFeedsIds = userFeeds[0].subscribed_feed_ids

    const userPostsFeed = await this.database('feeds').returning('uid').where({
      user_id: userId,
      name:    'Posts'
    });

    if (!userPostsFeed[0]) {
      // hard-reserved username without other data-structures
      return;
    }

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

    if (!postLikers.includes(authorId)) {
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
    const res = await this.database('bans').select('banned_user_id').orderBy('created_at', 'desc').where('user_id', userId);
    return res.map((record) => record.banned_user_id);
  }

  async getUserIdsWhoBannedUser(userId) {
    const res = await this.database('bans').select('user_id').orderBy('created_at', 'desc').where('banned_user_id', userId);
    return res.map((record) => record.user_id);
  }

  async getBannedFeedsIntIds(userId) {
    return await this.database
      .pluck('feeds.id')
      .from('feeds')
      .innerJoin('bans', 'bans.banned_user_id', 'feeds.user_id')
      .where('feeds.name', 'Posts')
      .where('bans.user_id', userId);
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
      const foundBan = res.find((record) => record.user_id == id);
      return foundBan ? [id, true] : [id, false];
    });

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

  getGroupAdministratorsIds(groupId) {
    return this.database('group_admins').pluck('user_id').orderBy('created_at', 'desc').where('group_id', groupId)
  }

  /**
   * Returns plain object with group UIDs as keys and arrays of admin UIDs as values
   */
  async getGroupsAdministratorsIds(groupIds) {
    const rows = await this.database.select('group_id', 'user_id').from('group_admins').where('group_id', 'in', groupIds);
    const res = {};
    rows.forEach(({ group_id, user_id }) => {
      if (!res.hasOwnProperty(group_id)) {
        res[group_id] = [];
      }
      res[group_id].push(user_id);
    });
    return res;
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

  getManagedGroupIds(userId) {
    return this.database('group_admins').pluck('group_id').orderBy('created_at', 'desc').where('user_id', userId);
  }

  async userHavePendingGroupRequests(userId) {
    const res = await this.database.first('r.id')
      .from('subscription_requests as r')
      .innerJoin('group_admins as a', 'a.group_id', 'r.to_user_id')
      .where({ 'a.user_id': userId })
      .limit(1);
    return !!res;
  }

  /**
   * Returns plain object with group UIDs as keys and arrays of requester's UIDs as values
   */
  async getPendingGroupRequests(groupsAdminId) {
    const rows = await this.database.select('r.from_user_id as user_id', 'r.to_user_id as group_id')
      .from('subscription_requests as r')
      .innerJoin('group_admins as a', 'a.group_id', 'r.to_user_id')
      .where({ 'a.user_id': groupsAdminId });

    const res = {};
    rows.forEach(({ group_id, user_id }) => {
      if (!res.hasOwnProperty(group_id)) {
        res[group_id] = [];
      }
      res[group_id].push(user_id);
    });
    return res;
  }

  ///////////////////////////////////////////////////
  // Attachments
  ///////////////////////////////////////////////////

  initAttachmentObject = (attrs) => {
    if (!attrs) {
      return null;
    }
    attrs = this._prepareModelPayload(attrs, ATTACHMENT_FIELDS, ATTACHMENT_FIELDS_MAPPING);
    return DbAdapter.initObject(Attachment, attrs, attrs.id);
  };

  async createAttachment(payload) {
    const preparedPayload = this._prepareModelPayload(payload, ATTACHMENT_COLUMNS, ATTACHMENT_COLUMNS_MAPPING)
    const res = await this.database('attachments').returning('uid').insert(preparedPayload)
    return res[0]
  }

  async getAttachmentById(id) {
    if (!validator.isUUID(id, 4)) {
      return null
    }
    const attrs = await this.database('attachments').first().where('uid', id)
    return this.initAttachmentObject(attrs);
  }

  async getAttachmentsByIds(ids) {
    const responses = await this.database('attachments').whereIn('uid', ids).orderByRaw(`position(uid::text in '${ids.toString()}')`)
    return responses.map(this.initAttachmentObject)
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
    return responses.map(this.initAttachmentObject)
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

  initCommentObject = (attrs) => {
    if (!attrs) {
      return null;
    }
    attrs = this._prepareModelPayload(attrs, COMMENT_FIELDS, COMMENT_FIELDS_MAPPING);
    return DbAdapter.initObject(Comment, attrs, attrs.id);
  };

  async createComment(payload) {
    const preparedPayload = this._prepareModelPayload(payload, COMMENT_COLUMNS, COMMENT_COLUMNS_MAPPING)
    const res = await this.database('comments').returning('uid').insert(preparedPayload)
    return res[0]
  }

  async getCommentById(id) {
    if (!validator.isUUID(id, 4)) {
      return null
    }
    const attrs = await this.database('comments').first().where('uid', id)
    return this.initCommentObject(attrs);
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
      query = query.where('user_id', 'not in', subquery);
    }

    const responses = await query;
    return responses.map(this.initCommentObject);
  }

  _deletePostComments(postId) {
    return this.database('comments').where({ post_id: postId }).delete()
  }


  ///////////////////////////////////////////////////
  // Feeds
  ///////////////////////////////////////////////////

  initTimelineObject = (attrs, params) => {
    if (!attrs) {
      return null;
    }
    attrs = this._prepareModelPayload(attrs, FEED_FIELDS, FEED_FIELDS_MAPPING)
    return DbAdapter.initObject(Timeline, attrs, attrs.id, params)
  }

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

  async cacheFetchUserTimelinesIds(userId) {
    const cacheKey = `timelines_user_${userId}`;

    // Check the cache first
    const cachedTimelines = await this.memoryCache.get(cacheKey);

    if (typeof cachedTimelines != 'undefined' && cachedTimelines) {
      // Cache hit
      return cachedTimelines;
    }

    // Cache miss, read from the database
    const res = await this.database('feeds').where('user_id', userId);
    const riverOfNews   = _.filter(res, (record) => { return record.name == 'RiverOfNews'});
    const hides         = _.filter(res, (record) => { return record.name == 'Hides'});
    const comments      = _.filter(res, (record) => { return record.name == 'Comments'});
    const likes         = _.filter(res, (record) => { return record.name == 'Likes'});
    const posts         = _.filter(res, (record) => { return record.name == 'Posts'});
    const directs       = _.filter(res, (record) => { return record.name == 'Directs'});
    const myDiscussions = _.filter(res, (record) => { return record.name == 'MyDiscussions'});

    const timelines =  {
      'RiverOfNews': riverOfNews[0] && riverOfNews[0].uid,
      'Hides':       hides[0] && hides[0].uid,
      'Comments':    comments[0] && comments[0].uid,
      'Likes':       likes[0] && likes[0].uid,
      'Posts':       posts[0] && posts[0].uid
    };

    if (directs[0]) {
      timelines['Directs'] = directs[0].uid;
    }

    if (myDiscussions[0]) {
      timelines['MyDiscussions'] = myDiscussions[0].uid;
    }

    if (res.length) {
      // Don not cache empty feeds lists
      await this.memoryCache.set(cacheKey, timelines);
    }

    return timelines;
  }

  async getUserTimelinesIds(userId) {
    return await this.cacheFetchUserTimelinesIds(userId);
  }

  async getTimelineById(id, params) {
    if (!validator.isUUID(id, 4)) {
      return null
    }
    const attrs = await this.database('feeds').first().where('uid', id);
    return this.initTimelineObject(attrs, params);
  }

  async getTimelineByIntId(id, params) {
    const attrs = await this.database('feeds').first().where('id', id);
    return this.initTimelineObject(attrs, params);
  }

  async getTimelinesByIds(ids, params) {
    const responses = await this.database('feeds').whereIn('uid', ids).orderByRaw(`position(uid::text in '${ids.toString()}')`);
    return responses.map((r) => this.initTimelineObject(r, params));
  }

  async getTimelinesByIntIds(ids, params) {
    const responses = await this.database('feeds').whereIn('id', ids).orderByRaw(`position(id::text in '${ids.toString()}')`);
    return responses.map((r) => this.initTimelineObject(r, params));
  }

  async getTimelinesIntIdsByUUIDs(uuids) {
    const responses = await this.database('feeds').select('id').whereIn('uid', uuids);
    return responses.map((record) => record.id);
  }

  async getTimelinesUUIDsByIntIds(ids) {
    const responses = await this.database('feeds').select('uid').whereIn('id', ids)

    const uuids = responses.map((record) => {
      return record.uid
    })
    return uuids
  }

  async getTimelinesUserSubscribed(userId, feedType = null) {
    const where = { 's.user_id': userId };
    if (feedType !== null) {
      where['f.name'] = feedType;
    }
    const records = await this.database
      .select('f.*')
      .from('subscriptions as s')
      .innerJoin('feeds as f', 's.feed_id', 'f.uid')
      .where(where)
      .orderBy('s.created_at', 'desc');
    return records.map(this.initTimelineObject);
  }

  async getUserNamedFeedId(userId, name) {
    const response = await this.database('feeds').select('uid').where({
      user_id: userId,
      name
    });

    if (response.length === 0) {
      return null;
    }

    return response[0].uid;
  }

  async getUserNamedFeed(userId, name, params) {
    const response = await this.database('feeds').first().returning('uid').where({
      user_id: userId,
      name
    });
    return this.initTimelineObject(response, params);
  }

  async getUserNamedFeedsIntIds(userId, names) {
    const responses = await this.database('feeds').select('id').where('user_id', userId).where('name', 'in', names)

    const ids = responses.map((record) => {
      return record.id
    })
    return ids
  }

  async getUsersNamedFeedsIntIds(userIds, names) {
    const responses = await this.database('feeds').select('id').where('user_id', 'in', userIds).where('name', 'in', names);
    return responses.map((record) => record.id);
  }

  async deleteUser(uid) {
    await this.database('users').where({ uid }).delete();
    await this.cacheFlushUser(uid)
  }

  ///////////////////////////////////////////////////
  // Post
  ///////////////////////////////////////////////////

  initPostObject = (attrs, params) => {
    if (!attrs) {
      return null;
    }
    attrs = this._prepareModelPayload(attrs, POST_FIELDS, POST_FIELDS_MAPPING);
    return DbAdapter.initObject(Post, attrs, attrs.id, params);
  }

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
    if (!validator.isUUID(id, 4)) {
      return null
    }
    const attrs = await this.database('posts').first().where('uid', id)
    return this.initPostObject(attrs, params)
  }

  async getPostsByIds(ids, params) {
    const responses = await this.database('posts').orderBy('updated_at', 'desc').whereIn('uid', ids)
    return responses.map((attrs) => this.initPostObject(attrs, params))
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

  async getPostUsagesInTimelines(postId) {
    const res = await this.database('posts').where('uid', postId)
    const attrs = res[0]
    if (!attrs) {
      return []
    }

    return this.getTimelinesUUIDsByIntIds(attrs.feed_ids)
  }

  async insertPostIntoFeeds(feedIntIds, postId) {
    if (!feedIntIds || feedIntIds.length == 0) {
      return null
    }

    return this.database.raw('UPDATE posts SET feed_ids = (feed_ids | ?) WHERE uid = ?', [feedIntIds, postId]);
  }

  async withdrawPostFromFeeds(feedIntIds, postUUID) {
    return this.database.raw('UPDATE posts SET feed_ids = (feed_ids - ?) WHERE uid = ?', [feedIntIds, postUUID]);
  }

  async isPostPresentInTimeline(timelineId, postId) {
    const res = await this.database('posts').where('uid', postId);
    const postData = res[0];
    return postData.feed_ids.includes(timelineId);
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

  /**
   * Returns uids of users who banned this user or banned by this user.
   * It is useful for posts visibility check.
   * @param {String} userId   - UID of user
   * @return {Array.<String>} - UIDs of users
   */
  async getBansAndBannersOfUser(userId) {
    const sql = `
      select
        distinct coalesce( nullif( user_id, :userId ), banned_user_id ) as id
      from
        bans 
      where
        user_id = :userId
        or banned_user_id = :userId
    `;
    const { rows } = await this.database.raw(sql, { userId });
    return _.map(rows, 'id');
  }

  /**
   * Returns integer ids of private feeds that user can view
   * @param {String} userId   - UID of user
   * @return {Array.<Number>} - ids of feeds
   */
  async getVisiblePrivateFeedIntIds(userId) {
    const sql = `
      select f.id from 
        feeds f 
        join subscriptions s on f.uid = s.feed_id 
        join users u on u.uid = f.user_id and u.is_private 
      where s.user_id = :userId and f.name = 'Posts' 
      union  -- viewer's own Posts and Directs are always visible  
        select id from feeds where user_id = :userId and name in ('Posts', 'Directs') 
    `;

    const { rows } = await this.database.raw(sql, { userId });
    return _.map(rows, 'id');
  }

  /**
   * Returns UIDs of timelines posts
   */
  async getTimelinePostsIds(timelineIntIds, viewerId = null, params = {}) {
    params = {
      limit:          30,
      offset:         0,
      sort:           'updated',
      withLocalBumps: false,
      withMyPosts:    false,
      ...params,
    };

    params.withLocalBumps = params.withLocalBumps && !!viewerId && params.sort === 'updated';

    // Private feeds viewer can read
    let visiblePrivateFeedIntIds = [];
    // Users who banned viewer or banned by viewer (viewer should not see their posts)
    let  bannedUsersIds = [];
    // Additional condition for params.withoutDirects option
    let noDirectsSQL = 'true';
    let myPostsSQL = 'false';

    if (viewerId) {
      [
        visiblePrivateFeedIntIds,
        bannedUsersIds,
      ] = await Promise.all([
        this.getVisiblePrivateFeedIntIds(viewerId),
        this.getBansAndBannersOfUser(viewerId),
      ]);

      if (params.withoutDirects) {
        // Do not show directs-only messages (any messages posted to the viewer's 'Directs' feed and to ONE other feed)
        const [directsIntId] = await this.database.pluck('id').from('feeds').where({ user_id: viewerId, name: 'Directs' });
        noDirectsSQL = `not (destination_feed_ids && '{${directsIntId}}' and array_length(destination_feed_ids, 1) = 2)`;
      }

      if (params.withMyPosts) {
        // Show viewer own posts
        myPostsSQL = pgFormat('p.user_id = %L', viewerId);
      }
    }

    if (bannedUsersIds.length === 0) {
      bannedUsersIds.push(unexistedUID);
    }

    let sql;
    if (params.withLocalBumps) {
      sql = pgFormat(`
        select p.uid
        from 
          posts p
          left join local_bumps b on p.uid = b.post_id and b.user_id = %L
        where
          (p.feed_ids && %L or ${myPostsSQL})
          and not p.user_id in (%L)  -- bans
          and (not p.is_private or p.destination_feed_ids && %L)  -- privates
          and ${noDirectsSQL}
        order by
          greatest(p.updated_at, b.created_at) desc
        limit %L offset %L
        `,
        viewerId,
        `{${timelineIntIds.join(',')}}`,
        bannedUsersIds,
        `{${visiblePrivateFeedIntIds.join(',')}}`,
        params.limit,
        params.offset
      );
    } else {
      sql = pgFormat(`
        select p.uid
        from 
          posts p
        where
          (p.feed_ids && %L or ${myPostsSQL})
          and not p.user_id in (%L)  -- bans
          and ${viewerId ?
            pgFormat(`(not p.is_private or p.destination_feed_ids && %L)`, `{${visiblePrivateFeedIntIds.join(',')}}`) :
            'not p.is_protected'
          }
          and ${noDirectsSQL}
        order by
          p.%I desc
        limit %L offset %L
      `, `{${timelineIntIds.join(',')}}`, bannedUsersIds, `${params.sort}_at`, params.limit, params.offset);
    }
    return (await this.database.raw(sql)).rows.map((r) => r.uid);
  }

  // merges posts from "source" into "destination"
  async createMergedPostsTimeline(destinationTimelineId, sourceTimelineIds) {
    const transaction = async (trx) => {
      await trx.raw(
        'UPDATE "posts" SET "feed_ids" = ("feed_ids" | ?) WHERE "feed_ids" && ?',
        [[destinationTimelineId], sourceTimelineIds]
      );
    };

    await this.executeSerizlizableTransaction(transaction);
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

  /**
   * Show all PUBLIC posts with
   * 10+ likes
   * 15+ comments by 5+ users
   * Created less than 60 days ago
   */
  bestPosts = async (currentUser, offset = 0, limit = 30) => {
    const MIN_LIKES = 10;
    const MIN_COMMENTS = 15;
    const MIN_COMMENT_AUTHORS = 5;
    const MAX_DAYS = 60;

    let bannedUsersFilter = '';
    let usersWhoBannedMeFilter = '';

    const publicOrVisibleForAnonymous = currentUser ? 'not "users"."is_private"' : 'not "users"."is_protected"'

    if (currentUser) {
      const [iBanned, bannedMe] = await Promise.all([
        this.getUserBansIds(currentUser.id),
        this.getUserIdsWhoBannedUser(currentUser.id)
      ]);

      bannedUsersFilter = this._getPostsFromBannedUsersSearchFilterCondition(iBanned);

      if (bannedMe.length > 0) {
        usersWhoBannedMeFilter = pgFormat('AND "feeds"."user_id" NOT IN (%L) ', bannedMe);
      }
    }

    const sql = `
      SELECT
        DISTINCT "posts".* FROM "posts"
      LEFT JOIN (SELECT post_id, COUNT("id") AS "comments_count", COUNT(DISTINCT "user_id") as "comment_authors_count" FROM "comments" GROUP BY "comments"."post_id") AS "c" ON "c"."post_id" = "posts"."uid"
      LEFT JOIN (SELECT post_id, COUNT("id") AS "likes_count" FROM "likes" GROUP BY "likes"."post_id") AS "l" ON "l"."post_id" = "posts"."uid"
      INNER JOIN "feeds" ON "posts"."destination_feed_ids" # feeds.id > 0 AND "feeds"."name" = 'Posts'
      INNER JOIN "users" ON "feeds"."user_id" = "users"."uid" AND ${publicOrVisibleForAnonymous}
      WHERE
        "l"."likes_count" >= ${MIN_LIKES} AND "c"."comments_count" >= ${MIN_COMMENTS} AND "c"."comment_authors_count" >= ${MIN_COMMENT_AUTHORS} AND "posts"."created_at" > (current_date - ${MAX_DAYS} * interval '1 day')
        ${bannedUsersFilter}
        ${usersWhoBannedMeFilter}
      ORDER BY "posts"."updated_at" DESC
      OFFSET ${offset} LIMIT ${limit}`;

    const res = await this.database.raw(sql);
    return res.rows;
  };

  /**
   * Returns array of objects with the following structure:
   * {
   *   post: <Post object>
   *   destinations: <array of {id (feed UID), name (feed type), user (feed owner UID)}
   *                 objects of posts' destination timelines>
   *   attachments: <array of Attachment objects>
   *   comments: <array of Comments objects>
   *   omittedComments: <number>
   *   likes: <array of liker's UIDs>
   *   omittedLikes: <number>
   * }
   */
  async getPostsWithStuffByIds(postsIds, viewerId = null, params = {}) {
    if (_.isEmpty(postsIds)) {
      return [];
    }

    params = {
      foldComments:        true,
      foldLikes:           true,
      maxUnfoldedComments: 3,
      maxUnfoldedLikes:    4,
      visibleFoldedLikes:  3,
      ...params,
    };

    const uniqPostsIds = _.uniq(postsIds);

    const postFields = _.without(Object.keys(POST_FIELDS), 'comments_count', 'likes_count').map((k) => pgFormat('%I', k));
    const attFields = Object.keys(ATTACHMENT_FIELDS).map((k) => pgFormat('%I', k));
    const commentFields = Object.keys(COMMENT_FIELDS).map((k) => pgFormat('%I', k));

    const destinationsSQL = pgFormat(`
      with posts as (
        -- unwind all destination_feed_ids from posts
        select distinct
          p.uid,
          unnest(p.destination_feed_ids) as feed_id
        from 
          posts p
        where 
          p.uid in (%L)
      )
      select
        p.uid as post_id, f.uid as id, f.name, f.user_id as user
      from 
        feeds f join posts p on f.id = p.feed_id
    `, uniqPostsIds);

    const [
      bannedUsersIds,
      friendsIds,
      postsData,
      attData,
      { rows: destData },
    ] = await Promise.all([
      viewerId ? this.getUserBansIds(viewerId) : [],
      viewerId ? this.getUserFriendIds(viewerId) : [],
      this.database.select(...postFields).from('posts').whereIn('uid', uniqPostsIds),
      this.database.select(...attFields).from('attachments').orderBy('created_at', 'asc').whereIn('post_id', uniqPostsIds),
      this.database.raw(destinationsSQL),
    ]);

    if (bannedUsersIds.length === 0) {
      bannedUsersIds.push(unexistedUID);
    }
    if (friendsIds.length === 0) {
      friendsIds.push(unexistedUID);
    }

    const allLikesSQL = pgFormat(`
      select
        post_id, user_id,
        rank() over (partition by post_id order by
          user_id in (%L) desc,
          user_id in (%L) desc,
          created_at desc,
          id desc
        ),
        count(*) over (partition by post_id) 
      from likes
      where post_id in (%L) and user_id not in (%L)
    `, [viewerId], friendsIds, uniqPostsIds, bannedUsersIds);

    const likesSQL = `
      with likes as (${allLikesSQL})
      select post_id, array_agg(user_id) as likes, count from likes
      ${params.foldLikes ?
        pgFormat(`where count <= %L or rank <= %L`, params.maxUnfoldedLikes, params.visibleFoldedLikes) :
        ``}
      group by post_id, count 
    `;

    const allCommentsSQL = pgFormat(`
      select
        ${commentFields.join(', ')}, id,
        rank() over (partition by post_id order by created_at, id),
        count(*) over (partition by post_id) 
      from comments
      where post_id in (%L) and user_id not in (%L)
    `, uniqPostsIds, bannedUsersIds);

    const commentsSQL = `
      with comments as (${allCommentsSQL})
      select ${commentFields.join(', ')}, id, count from comments
      ${params.foldComments ?
        pgFormat(`where count <= %L or rank = 1 or rank = count`, params.maxUnfoldedComments) :
        ``}
      order by created_at, id
    `;

    const [
      { rows: likesData },
      { rows: commentsData },
    ] = await Promise.all([
      this.database.raw(likesSQL),
      this.database.raw(commentsSQL),
    ]);

    const results = {};

    for (const post of postsData) {
      results[post.uid] = {
        post:            this.initPostObject(post),
        destinations:    [],
        attachments:     [],
        comments:        [],
        omittedComments: 0,
        likes:           [],
        omittedLikes:    0,
      };
    }

    for (const dest of destData) {
      results[dest.post_id].destinations.push(_.omit(dest, 'post_id'));
    }

    for (const att of attData) {
      results[att.post_id].attachments.push(this.initAttachmentObject(att));
    }

    for (const lk of likesData) {
      results[lk.post_id].likes = lk.likes;
      results[lk.post_id].omittedLikes = params.foldLikes ? lk.count - lk.likes.length : 0;
    }

    for (const comm of commentsData) {
      results[comm.post_id].comments.push(this.initCommentObject(comm));
      results[comm.post_id].omittedComments = (params.foldComments && comm.count > params.maxUnfoldedComments) ? comm.count - 2 : 0;
    }

    return postsIds.map((id) => results[id] || null);
  }

  ///////////////////////////////////////////////////
  // Subscriptions
  ///////////////////////////////////////////////////

  getUserSubscriptionsIds(userId) {
    return this.database('subscriptions').pluck('feed_id').orderBy('created_at', 'desc').where('user_id', userId)
  }

  getUserSubscriptionsIdsByType(userId, feedType) {
    return this.database
      .pluck('s.feed_id')
      .from('subscriptions as s').innerJoin('feeds as f', 's.feed_id', 'f.uid')
      .where({ 's.user_id': userId, 'f.name': feedType })
      .orderBy('s.created_at', 'desc')
  }

  getUserFriendIds(userId) {
    const feedType = 'Posts';
    return this.database
      .pluck('f.user_id')
      .from('subscriptions as s')
      .innerJoin('feeds as f', 's.feed_id', 'f.uid')
      .where({ 's.user_id': userId, 'f.name': feedType })
      .orderBy('s.created_at', 'desc');
  }

  async isUserSubscribedToTimeline(currentUserId, timelineId) {
    const res = await this.database('subscriptions').where({
      feed_id: timelineId,
      user_id: currentUserId
    }).count()
    return parseInt(res[0].count) != 0
  }

  async isUserSubscribedToOneOfTimelines(currentUserId, timelineIds) {
    const q = pgFormat('SELECT COUNT(*) AS "cnt" FROM "subscriptions" WHERE "feed_id" IN (%L) AND "user_id" = ?', timelineIds);
    const res = await this.database.raw(q, [currentUserId]);

    return res.rows[0].cnt > 0;
  }

  async getTimelineSubscribersIds(timelineId) {
    return await this.database('subscriptions').pluck('user_id').orderBy('created_at', 'desc').where('feed_id', timelineId)
  }

  async getTimelineSubscribers(timelineIntId) {
    const responses = this.database('users').whereRaw('subscribed_feed_ids && ?', [[timelineIntId]])
    return responses.map(this.initUserObject)
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

    const res = await this.database.raw(
      'UPDATE users SET subscribed_feed_ids = (subscribed_feed_ids | ?) WHERE uid = ? RETURNING subscribed_feed_ids',
      [feedIntIds, currentUserId]
    );

    await this.cacheFlushUser(currentUserId)

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

    const res = await this.database.raw(
      'UPDATE users SET subscribed_feed_ids = (subscribed_feed_ids - ?) WHERE uid = ? RETURNING subscribed_feed_ids',
      [feedIntIds, currentUserId]
    );

    await this.cacheFlushUser(currentUserId)

    return res.rows[0].subscribed_feed_ids
  }

  /**
   * Executes SERIALIZABLE transaction until it succeeds
   * @param transaction
   */
  async executeSerizlizableTransaction(transaction) {
    while (true) {  // eslint-disable-line no-constant-condition
      try {
        await this.database.transaction(async (trx) => {  // eslint-disable-line babel/no-await-in-loop
          await trx.raw('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
          return transaction(trx);
        });
        break;
      } catch (e) {
        if (e.code === '40001') {
          // Serialization failure (other transaction has changed the data). RETRY
          continue;
        }

        throw e;
      }
    }
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

  async searchPosts(query, currentUserId, visibleFeedIds, bannedUserIds, offset, limit) {
    const textSearchConfigName = this.database.client.config.textSearchConfigName
    const bannedUsersFilter = this._getPostsFromBannedUsersSearchFilterCondition(bannedUserIds)
    const bannedCommentAuthorFilter = this._getCommentsFromBannedUsersSearchFilterCondition(bannedUserIds)
    const searchCondition = this._getTextSearchCondition(query, textSearchConfigName)
    const commentSearchCondition = this._getCommentSearchCondition(query, textSearchConfigName)
    const publicOrVisibleForAnonymous = currentUserId ? 'not users.is_private' : 'not users.is_protected'

    if (!visibleFeedIds || visibleFeedIds.length == 0) {
      visibleFeedIds = 'NULL'
    }

    const publicPostsSubQuery = 'select "posts".* from "posts" ' +
      'inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' ' +
      `inner join "users" on feeds.user_id=users.uid and ${publicOrVisibleForAnonymous} ` +
      `where ${searchCondition} ${bannedUsersFilter}`;

    const publicPostsByCommentsSubQuery = 'select "posts".* from "posts" ' +
      'inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' ' +
      `inner join "users" on feeds.user_id=users.uid and ${publicOrVisibleForAnonymous} ` +
      `where
          posts.uid in (
            select post_id from comments where ${commentSearchCondition} ${bannedCommentAuthorFilter}
          ) ${bannedUsersFilter}`;

    let subQueries = [publicPostsSubQuery, publicPostsByCommentsSubQuery];

    if (currentUserId) {
      const myPostsSubQuery = 'select "posts".* from "posts" ' +
        `where "posts"."user_id" = '${currentUserId}' and ${searchCondition}`;

      const myPostsByCommentsSubQuery = 'select "posts".* from "posts" ' +
        `where "posts"."user_id" = '${currentUserId}' and
          posts.uid in (
            select post_id from comments where ${commentSearchCondition} ${bannedCommentAuthorFilter}
          ) `;

      const visiblePrivatePostsSubQuery = 'select "posts".* from "posts" ' +
        'inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' ' +
        'inner join "users" on feeds.user_id=users.uid and users.is_private=true ' +
        `where ${searchCondition} and "feeds"."id" in (${visibleFeedIds}) ${bannedUsersFilter}`;

      const visiblePrivatePostsByCommentsSubQuery = 'select "posts".* from "posts" ' +
        'inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' ' +
        'inner join "users" on feeds.user_id=users.uid and users.is_private=true ' +
        `where
          posts.uid in (
            select post_id from comments where ${commentSearchCondition} ${bannedCommentAuthorFilter}
          )
          and "feeds"."id" in (${visibleFeedIds}) ${bannedUsersFilter}`;

      subQueries = [...subQueries, myPostsSubQuery, myPostsByCommentsSubQuery, visiblePrivatePostsSubQuery, visiblePrivatePostsByCommentsSubQuery];
    }

    const res = await this.database.raw(
      `select * from (${subQueries.join(' union ')}) as found_posts order by found_posts.updated_at desc offset ${offset} limit ${limit}`
    )
    return res.rows
  }

  async searchUserPosts(query, targetUserId, visibleFeedIds, bannedUserIds, offset, limit) {
    const textSearchConfigName = this.database.client.config.textSearchConfigName
    const bannedUsersFilter = this._getPostsFromBannedUsersSearchFilterCondition(bannedUserIds)
    const bannedCommentAuthorFilter = this._getCommentsFromBannedUsersSearchFilterCondition(bannedUserIds)
    const searchCondition = this._getTextSearchCondition(query, textSearchConfigName)
    const commentSearchCondition = this._getCommentSearchCondition(query, textSearchConfigName)

    const publicPostsSubQuery = 'select "posts".* from "posts" ' +
      'inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' ' +
      'inner join "users" on feeds.user_id=users.uid and users.is_private=false ' +
      `where ${searchCondition} ${bannedUsersFilter}`;

    const publicPostsByCommentsSubQuery = 'select "posts".* from "posts" ' +
      'inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' ' +
      'inner join "users" on feeds.user_id=users.uid and users.is_private=false ' +
      `where
          posts.uid in (
            select post_id from comments where ${commentSearchCondition} ${bannedCommentAuthorFilter}
          ) ${bannedUsersFilter}`;

    let subQueries = [publicPostsSubQuery, publicPostsByCommentsSubQuery];

    if (visibleFeedIds && visibleFeedIds.length > 0) {
      const visiblePrivatePostsSubQuery = 'select "posts".* from "posts" ' +
        'inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' ' +
        'inner join "users" on feeds.user_id=users.uid and users.is_private=true ' +
        `where ${searchCondition} and "feeds"."id" in (${visibleFeedIds}) ${bannedUsersFilter}`;

      const visiblePrivatePostsByCommentsSubQuery = 'select "posts".* from "posts" ' +
        'inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' ' +
        'inner join "users" on feeds.user_id=users.uid and users.is_private=true ' +
        `where
          posts.uid in (
            select post_id from comments where ${commentSearchCondition} ${bannedCommentAuthorFilter}
          )
          and "feeds"."id" in (${visibleFeedIds}) ${bannedUsersFilter}`;

      subQueries = [...subQueries, visiblePrivatePostsSubQuery, visiblePrivatePostsByCommentsSubQuery];
    }

    const res = await this.database.raw(
      `select * from (${subQueries.join(' union ')}) as found_posts where found_posts.user_id='${targetUserId}' order by found_posts.updated_at desc offset ${offset} limit ${limit}`
    )
    return res.rows
  }

  async searchGroupPosts(query, groupFeedId, visibleFeedIds, bannedUserIds, offset, limit) {
    const textSearchConfigName = this.database.client.config.textSearchConfigName
    const bannedUsersFilter = this._getPostsFromBannedUsersSearchFilterCondition(bannedUserIds)
    const bannedCommentAuthorFilter = this._getCommentsFromBannedUsersSearchFilterCondition(bannedUserIds)
    const searchCondition = this._getTextSearchCondition(query, textSearchConfigName)
    const commentSearchCondition = this._getCommentSearchCondition(query, textSearchConfigName)

    if (!visibleFeedIds || visibleFeedIds.length == 0) {
      visibleFeedIds = 'NULL'
    }

    const publicPostsSubQuery = 'select "posts".* from "posts" ' +
      `inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' and feeds.uid='${groupFeedId}' ` +
      'inner join "users" on feeds.user_id=users.uid and users.is_private=false ' +
      `where ${searchCondition} ${bannedUsersFilter}`;

    const publicPostsByCommentsSubQuery = 'select "posts".* from "posts" ' +
      `inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' and feeds.uid='${groupFeedId}' ` +
      'inner join "users" on feeds.user_id=users.uid and users.is_private=false ' +
      `where
          posts.uid in (
            select post_id from comments where ${commentSearchCondition} ${bannedCommentAuthorFilter}
          ) ${bannedUsersFilter}`;

    let subQueries = [publicPostsSubQuery, publicPostsByCommentsSubQuery];

    if (visibleFeedIds && visibleFeedIds.length > 0) {
      const visiblePrivatePostsSubQuery = 'select "posts".* from "posts" ' +
        `inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' and feeds.uid='${groupFeedId}' ` +
        'inner join "users" on feeds.user_id=users.uid and users.is_private=true ' +
        `where ${searchCondition} and "feeds"."id" in (${visibleFeedIds}) ${bannedUsersFilter}`;

      const visiblePrivatePostsByCommentsSubQuery = 'select "posts".* from "posts" ' +
        `inner join "feeds" on posts.destination_feed_ids # feeds.id > 0 and feeds.name=\'Posts\' and feeds.uid='${groupFeedId}' ` +
        'inner join "users" on feeds.user_id=users.uid and users.is_private=true ' +
        `where
          posts.uid in (
            select post_id from comments where ${commentSearchCondition} ${bannedCommentAuthorFilter}
          )
          and "feeds"."id" in (${visibleFeedIds}) ${bannedUsersFilter}`;

      subQueries = [...subQueries, visiblePrivatePostsSubQuery, visiblePrivatePostsByCommentsSubQuery];
    }

    const res = await this.database.raw(
      `select * from (${subQueries.join(' union ')}) as found_posts order by found_posts.updated_at desc offset ${offset} limit ${limit}`
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
    if (bannedUserIds.length === 0) {
      return '';
    }

    return pgFormat('and posts.user_id not in (%L) ', bannedUserIds);
  }

  _getCommentsFromBannedUsersSearchFilterCondition(bannedUserIds) {
    if (bannedUserIds.length === 0) {
      return '';
    }

    return pgFormat(`and comments.user_id not in (%L) `, bannedUserIds)
  }

  _getTextSearchCondition(parsedQuery, textSearchConfigName) {
    const searchConditions = []

    if (parsedQuery.query.length > 2) {
      const sql = pgFormat(`to_tsvector(%L, posts.body) @@ to_tsquery(%L, %L)`, textSearchConfigName, textSearchConfigName, parsedQuery.query)
      searchConditions.push(sql)
    }

    if (parsedQuery.quotes.length > 0) {
      const quoteConditions = parsedQuery.quotes.map((quote) => {
        const regex = `([[:<:]]|\\W|^)${_.escapeRegExp(quote)}([[:>:]]|\\W|$)`;
        return pgFormat(`posts.body ~ %L`, regex)
      });
      searchConditions.push(`${quoteConditions.join(' and ')}`)
    }

    if (parsedQuery.hashtags.length > 0) {
      const hashtagConditions = parsedQuery.hashtags.map((tag) => {
        return pgFormat(`posts.uid in (
            select u.entity_id from hashtag_usages as u where u.hashtag_id in (
              select hashtags.id from hashtags where hashtags.name = %L
            ) and u.type = 'post'
          )`, tag)
      })

      searchConditions.push(`${hashtagConditions.join(' and ')}`)
    }

    if (searchConditions.length == 0) {
      return ' 1=0 '
    }

    return `${searchConditions.join(' and ')} `
  }

  _getCommentSearchCondition(parsedQuery, textSearchConfigName) {
    const searchConditions = []
    if (parsedQuery.query.length > 2) {
      const sql = pgFormat(`to_tsvector(%L, comments.body) @@ to_tsquery(%L, %L)`, textSearchConfigName, textSearchConfigName, parsedQuery.query)
      searchConditions.push(sql)
    }
    if (parsedQuery.quotes.length > 0) {
      const quoteConditions = parsedQuery.quotes.map((quote) => {
        const regex = `([[:<:]]|\\W|^)${_.escapeRegExp(quote)}([[:>:]]|\\W|$)`;
        return pgFormat(`comments.body ~ %L`, regex)
      });
      searchConditions.push(`${quoteConditions.join(' and ')}`)
    }

    if (parsedQuery.hashtags.length > 0) {
      const hashtagConditions = parsedQuery.hashtags.map((tag) => {
        return pgFormat(`comments.uid in (
            select u.entity_id from hashtag_usages as u where u.hashtag_id in (
              select hashtags.id from hashtags where hashtags.name = %L
            ) and u.type = 'comment'
          )`, tag)
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

    const lowerCaseNames =  names.map((hashtag) => {
      return hashtag.toLowerCase()
    })

    const res = await this.database('hashtags').select('id', 'name').where('name', 'in', lowerCaseNames)
    return res.map((t) => t.id)
  }

  async getOrCreateHashtagIdsByNames(names) {
    if (!names || names.length == 0) {
      return []
    }

    const lowerCaseNames    =  names.map((hashtag) => {
      return hashtag.toLowerCase()
    })

    const targetTagNames   = _.sortBy(lowerCaseNames)
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
      .where('hashtag_usages.entity_id', '=', postId).andWhere('hashtag_usages.type', 'post')
  }

  getCommentHashtags(commentId) {
    return this.database.select('hashtags.id', 'hashtags.name').from('hashtags')
      .join('hashtag_usages', { 'hashtag_usages.hashtag_id': 'hashtags.id' })
      .where('hashtag_usages.entity_id', '=', commentId).andWhere('hashtag_usages.type', 'comment')
  }

  async createHashtags(names) {
    if (!names || names.length == 0) {
      return []
    }
    const payload = names.map((name) => {
      return pgFormat(`(%L)`, name.toLowerCase())
    }).join(',')
    const res = await this.database.raw(`insert into hashtags ("name") values ${payload} on conflict do nothing returning "id" `)
    return res.rows.map((t) => t.id)
  }

  linkHashtags(tagIds, entityId, toPost = true) {
    if (tagIds.length == 0) {
      return false
    }

    const entityType = toPost ? 'post' : 'comment'
    const payload = tagIds.map((hashtagId) => {
      return pgFormat(`(%L, %L, %L)`, hashtagId, entityId, entityType)
    }).join(',')

    return this.database.raw(`insert into hashtag_usages ("hashtag_id", "entity_id", "type") values ${payload} on conflict do nothing`)
  }

  unlinkHashtags(tagIds, entityId, fromPost = true) {
    if (tagIds.length == 0) {
      return false
    }
    let entityType = 'post'
    if (!fromPost) {
      entityType = 'comment'
    }
    return this.database('hashtag_usages').where('hashtag_id', 'in', tagIds).where('entity_id', entityId).where('type', entityType).del()
  }

  async linkPostHashtagsByNames(names, postId) {
    if (!names || names.length == 0) {
      return false
    }
    const hashtagIds = await this.getOrCreateHashtagIdsByNames(names)
    if (!hashtagIds || hashtagIds.length == 0) {
      return false
    }
    return this.linkHashtags(hashtagIds, postId)
  }

  async unlinkPostHashtagsByNames(names, postId) {
    if (!names || names.length == 0) {
      return false
    }
    const hashtagIds = await this.getHashtagIdsByNames(names)
    if (!hashtagIds || hashtagIds.length == 0) {
      return false
    }
    return this.unlinkHashtags(hashtagIds, postId)
  }

  async linkCommentHashtagsByNames(names, commentId) {
    if (!names || names.length == 0) {
      return false
    }
    const hashtagIds = await this.getOrCreateHashtagIdsByNames(names)
    if (!hashtagIds || hashtagIds.length == 0) {
      return false
    }
    return this.linkHashtags(hashtagIds, commentId, false)
  }

  async unlinkCommentHashtagsByNames(names, commentId) {
    if (!names || names.length == 0) {
      return false
    }
    const hashtagIds = await this.getHashtagIdsByNames(names)
    if (!hashtagIds || hashtagIds.length == 0) {
      return false
    }
    return this.unlinkHashtags(hashtagIds, commentId, false)
  }

  ///////////////////////////////////////////////////
  // Unread directs counter
  ///////////////////////////////////////////////////

  async markAllDirectsAsRead(userId) {
    const currentTime = new Date().toISOString()

    const payload = { directs_read_at: currentTime }

    return this.database('users').where('uid', userId).update(payload)
  }

  async getUnreadDirectsNumber(userId) {
    const [
      [directsFeedId],
      [directsReadAt],
    ] = await Promise.all([
      this.database.pluck('id').from('feeds').where({ 'user_id': userId, 'name': 'Directs' }),
      this.database.pluck('directs_read_at').from('users').where({ 'uid': userId }),
    ]);

    /*
     Select posts from my Directs feed, created after the directs_read_at authored by
     users other than me and then add posts from my Directs feed, having comments created after the directs_read_at
     authored by users other than me
     */
    const sql = `
      select count(distinct unread.id) as cnt from (
        select id from 
          posts 
        where
          destination_feed_ids && :feeds
          and user_id != :userId
          and created_at > :directsReadAt
        union
        select p.id from
          comments c
          join posts p on p.uid = c.post_id
        where
          p.destination_feed_ids && :feeds
          and c.user_id != :userId
          and c.created_at > :directsReadAt
      ) as unread`;

    const res = await this.database.raw(sql, { feeds: `{${directsFeedId}}`, userId, directsReadAt });
    return res.rows[0].cnt;
  }

  ///////////////////////////////////////////////////
  // Stats
  ///////////////////////////////////////////////////
  async getStats(data, start_date, end_date) {
    const supported_metrics = ['comments', 'comments_creates', 'posts', 'posts_creates', 'users', 'registrations',
      'active_users', 'likes', 'likes_creates', 'groups', 'groups_creates'];

    const metrics = data.split(',').sort();

    let metrics_req = ``, metrics_list = `''null''`;

    for (const metric of metrics) {
      if (supported_metrics.includes(metric)) {
        metrics_req += `, "${metric}" bigint`;
        metrics_list += `, ''${metric}''`;
      } else {
        throw new Error(`ERROR: unsupported metric: ${metric}`);
      }
    }

    if (!metrics_req.length) {
      return null;
    }

    const sql = pgFormat(`
      select * from crosstab(
        'select to_char(dt, ''YYYY-MM-DD'') as date, metric, value from stats 
          where dt between '%L' and '%L' 
            and metric in (%s)
          order by 1,2;')  
       AS ct ("date" text %s);`, start_date, end_date, metrics_list, metrics_req);

    const res = await this.database.raw(sql);
    return res.rows;
  }
}
