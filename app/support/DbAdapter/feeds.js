import _ from 'lodash';
import validator from 'validator'

import { Timeline } from '../../models';
import { initObject, prepareModelPayload } from './utils';

///////////////////////////////////////////////////
// Feeds
///////////////////////////////////////////////////

const feedsTrait = (superClass) => class extends superClass {
  async createTimeline(payload) {
    const preparedPayload = prepareModelPayload(payload, FEED_COLUMNS, FEED_COLUMNS_MAPPING)
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
    const riverOfNews   = _.filter(res, (record) => record.name === 'RiverOfNews');
    const hides         = _.filter(res, (record) => record.name === 'Hides');
    const comments      = _.filter(res, (record) => record.name === 'Comments');
    const likes         = _.filter(res, (record) => record.name === 'Likes');
    const posts         = _.filter(res, (record) => record.name === 'Posts');
    const directs       = _.filter(res, (record) => record.name === 'Directs');
    const myDiscussions = _.filter(res, (record) => record.name === 'MyDiscussions');

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
    return initTimelineObject(attrs, params);
  }

  async getTimelineByIntId(id, params) {
    const attrs = await this.database('feeds').first().where('id', id);
    return initTimelineObject(attrs, params);
  }

  async getTimelinesByIds(ids, params) {
    const { rows } = await this.database.raw(
      `select f.* 
      from
        unnest(:ids::uuid[]) with ordinality as src (uid, ord)
        join feeds f on f.uid = src.uid
      order by src.ord
      `,
      { ids }
    );
    return rows.map((r) => initTimelineObject(r, params));
  }

  async getTimelinesByIntIds(ids, params) {
    const responses = await this.database('feeds').whereIn('id', ids).orderByRaw(`position(id::text in '${ids.toString()}')`);
    return responses.map((r) => initTimelineObject(r, params));
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
    return records.map(initTimelineObject);
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
    return initTimelineObject(response, params);
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

  async getUsersNamedTimelines(userIds, name, params) {
    const { rows } = await this.database.raw(
      `select f.* 
      from
        unnest(:userIds::uuid[]) with ordinality as src (uid, ord)
        join feeds f on f.user_id = src.uid and f.name = :name
      order by src.ord
      `,
      { userIds, name }
    );
    return rows.map((r) => initTimelineObject(r, params));
  }

  async deleteUser(uid) {
    await this.database('users').where({ uid }).delete();
    await this.cacheFlushUser(uid)
  }
};

export default feedsTrait;

///////////////////////////////////////////////////

function initTimelineObject(attrs, params) {
  if (!attrs) {
    return null;
  }
  attrs = prepareModelPayload(attrs, FEED_FIELDS, FEED_FIELDS_MAPPING);
  return initObject(Timeline, attrs, attrs.id, params);
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
