import validator from 'validator'

import { Timeline, User } from '../../models';

import { initObject, prepareModelPayload } from './utils';
import { lockByUUID, USER_SUBSCRIPTIONS } from './adv-locks';

///////////////////////////////////////////////////
// Feeds
///////////////////////////////////////////////////

// By default this trait methods returns only *inherent* user timelines (with
// ord is null) that was created with user account. The user-created *auxiliary*
// RiverOfNews timelines (with non-null 'ord') are handled by a separate methods
// with explicit mention in comment.

const feedsTrait = (superClass) => class extends superClass {
  async createTimeline(payload) {
    const preparedPayload = prepareModelPayload(payload, FEED_COLUMNS, FEED_COLUMNS_MAPPING)
    const [res] = await this.database('feeds').returning(['id', 'uid']).insert(preparedPayload)
    return { intId: res.id, id: res.uid }
  }

  createUserTimelines(userId, timelineNames) {
    return Promise.all(timelineNames.map((name) => this.createTimeline({ name, userId })));
  }

  async cacheFetchUserTimelinesIds(userId) {
    // cacheVersion should change when all users' feeds sets changes.
    const cacheVersion = 2;
    const cacheKey = `timelines_user_${cacheVersion}_${userId}`;

    // Check the cache first
    const cachedTimelines = await this.memoryCache.get(cacheKey);

    if (typeof cachedTimelines != 'undefined' && cachedTimelines) {
      // Cache hit
      return cachedTimelines;
    }

    // Cache miss, read from the database
    const res = await this.database('feeds').where({ 'user_id': userId, ord: null });
    const timelines = {};

    for (const name of User.feedNames) {
      const feed = res.find((record) => record.name === name);

      if (feed) {
        timelines[name] = feed.uid;
      }
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
    if (!validator.isUUID(id)) {
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
    const { rows } = await this.database.raw(
      `select f.* 
      from
        unnest(:ids::int[]) with ordinality as src (id, ord)
        join feeds f on f.id = src.id
      order by src.ord
      `,
      { ids }
    );
    return rows.map((r) => initTimelineObject(r, params));
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
      .orderBy('s.created_at', 'desc')
      .orderBy('s.id', 'desc');
    return records.map(initTimelineObject);
  }

  async getUserNamedFeedId(userId, name) {
    const response = await this.database('feeds').select('uid')
      .where({ user_id: userId, name, ord: null });

    if (response.length === 0) {
      return null;
    }

    return response[0].uid;
  }

  async getUserNamedFeed(userId, name, params) {
    const response = await this.database('feeds').first().returning('uid')
      .where({ user_id: userId, name, ord: null });
    return initTimelineObject(response, params);
  }

  /**
   * Returns all (incuding auxiliary) user's feeds with the given name
   *
   * @param {string} userId
   * @param {string} name
   * @returns {Promise<Timeline[]>}
   */
  async getAllUserNamedFeed(userId, name) {
    const { rows } = await this.database.raw(`select * from feeds 
      where user_id = :userId and name = :name 
      order by ord asc nulls first, created_at desc`, { userId, name });

    return rows.map((r) => initTimelineObject(r));
  }

  /**
   * Add a new auxiliary user's feed with the given name
   *
   * @param {string} userId
   * @param {string} name
   * @param {string} title
   * @returns {Promise<Timeline>}
   */
  async addNamedFeed(userId, name, title) {
    const [row] = await this.database('feeds').returning('*').insert({
      title,
      name,
      user_id: userId,
      ord:     this.database.raw(
        '(select coalesce(max(ord), 0) + 1 from feeds where user_id = :userId and name = :name)',
        { userId, name }
      ),
    });
    return initTimelineObject(row);
  }


  async getUserNamedFeedsIntIds(userId, names) {
    // Use unnest magic to ensure that ids will be in the same order as names
    const { rows } = await this.database.raw(
      `select f.id 
      from
        unnest(:names::text[]) with ordinality as src (name, ord)
        left join feeds f on f.user_id = :userId and f.name = src.name
      where f.ord is null
      order by src.ord
      `,
      { userId, names }
    );
    return rows.map((r) =>  r && r.id);
  }

  async getUsersNamedFeedsIntIds(userIds, names) {
    const responses = await this.database('feeds').select('id')
      .where('user_id', 'in', userIds)
      .where('name', 'in', names)
      .where({ ord: null });
    return responses.map((record) => record.id);
  }

  async getUsersNamedTimelines(userIds, name, params) {
    const { rows } = await this.database.raw(
      `select f.* 
      from
        unnest(:userIds::uuid[]) with ordinality as src (uid, ord)
        join feeds f on f.user_id = src.uid and f.name = :name
      where f.ord is null
      order by src.ord
      `,
      { userIds, name }
    );
    return rows.map((r) => initTimelineObject(r, params));
  }

  /**
   * Destroys auxiliary feed. Returns false if the feed is not exists or cannot
   * be deleted.
   *
   * @param {string} feedId
   * @param {object} [params]
   * @returns {Promise<boolean>}
   */
  async destroyFeed(feedId, params = {}) {
    const thisFeed = await this.getTimelineById(feedId);

    if (!thisFeed || thisFeed.isInherent) {
      return false;
    }

    if (thisFeed.name !== 'RiverOfNews') {
      // Just delete the feed
      return !!(await this.database.raw(
        `delete from feeds where uid = :feedId returning true`,
        { feedId }));
    }

    // RiverOfNews
    return await this.database.transaction(async (trx) => {
      // Prevent other subscriberId subscription operations
      await lockByUUID(trx, USER_SUBSCRIPTIONS, thisFeed.userId);

      // Select and lock all user's RiverOfNews (to prevent removal)
      const feeds = await trx.getAll(
        `select * from feeds
          where user_id = :userId and name = :name
          order by uid for key share`,
        { userId: thisFeed.userId, name: thisFeed.name });

      // Feed is already removed?
      if (!feeds.find((f) => f.uid === feedId)) {
        return false;
      }

      // We should move existing subscriptions of this feed
      let backupFeed;

      if (params.backupFeedId && params.backupFeedId !== thisFeed.id) {
        backupFeed = feeds.find((f) => f.uid === params.backupFeedId);
      }

      if (!backupFeed) {
        // Use the inherent RiverOfNews as the backup feed
        backupFeed = feeds.find((f) => f.ord === null);
      }

      // Move subscriptions to the backup feed
      await trx.raw(
        `insert into homefeed_subscriptions (homefeed_id, target_user_id)
            select :toFeedId, s.target_user_id
            from homefeed_subscriptions s
              where s.homefeed_id = :fromFeedId
            on conflict do nothing`,
        {
          userId:     thisFeed.userId,
          fromFeedId: thisFeed.id,
          toFeedId:   backupFeed.uid,
        }
      );

      // Set the returning parameter
      params.backupFeedId = backupFeed.uid;

      // Now we can delete the feed
      await trx.raw(`delete from feeds where uid = :feedId`, { feedId });
      return true;
    });
  }

  async updateFeed(feedId, { title }) {
    const row = await this.database.getRow(
      `update feeds set title = :title, updated_at = default
        where uid = :feedId and ord is not null returning *`,
      { feedId, title }
    );
    return row ? initTimelineObject(row) : null;
  }

  /**
   * Reorders feeds in the order of the given UIDs. All feeds must have same
   * names and must belong to the same user. Only  auxiliary feeds will be
   * reordered.
   *
   * @param {string[]} feedIds
   * @return {Promise<void>}
   */
  async reorderFeeds(feedIds) {
    const { rows: feeds } = await this.database.raw(
      `select f.*  from
        unnest(:feedIds::uuid[]) with ordinality as src (uid, ord)
        join feeds f on f.uid = src.uid
        where f.ord is not null
      order by src.ord`, { feedIds });

    if (feeds.length <= 1) {
      // Nothing to do
      return;
    }

    if (feeds.some((f) => f.user_id !== feeds[0].user_id || f.name !== feeds[0].name)) {
      // Feeds are not uniform
      return;
    }

    feedIds = feeds.map((f) => f.uid);

    await this.database.raw(
      `update feeds set ord = src.ord, updated_at = default from
        unnest(:feedIds::uuid[]) with ordinality as src (uid, ord)
        where feeds.uid = src.uid`, { feedIds });
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
  userId:    'user_id',
  title:     'title',
}

const FEED_COLUMNS_MAPPING = {
  createdAt: (timestamp) => new Date(timestamp),
  updatedAt: (timestamp) => new Date(timestamp),
}

const FEED_FIELDS = {
  id:         'intId',
  uid:        'id',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  name:       'name',
  user_id:    'userId',
  title:      'title',
  ord:        'ord',
}

const FEED_FIELDS_MAPPING = {
  created_at: (time) => time.toISOString(),
  updated_at: (time) => time.toISOString(),
  user_id:    (user_id) => {return user_id ? user_id : ''},
  title:      (title, { name }) =>  name === 'RiverOfNews' && title === null
    ? Timeline.defaultRiverOfNewsTitle
    : title,
}
