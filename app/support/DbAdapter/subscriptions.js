import pgFormat from 'pg-format';

import { initUserObject } from './users';

///////////////////////////////////////////////////
// Subscriptions
///////////////////////////////////////////////////

const subscriptionsTrait = (superClass) => class extends superClass {
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

  async areUsersSubscribedToOneOfTimelines(userIds, timelineIds) {
    if (userIds.length === 0 || timelineIds.length === 0) {
      return [];
    }

    const q = pgFormat(`
      SELECT users.uid, (
        SELECT COUNT(*) > 0 FROM "subscriptions"
        WHERE "user_id"= users.uid
          and "feed_id" IN (%L)
      ) as is_subscribed FROM users
      WHERE users.uid IN (%L)
    `, timelineIds, userIds);
    const res = await this.database.raw(q);

    return res.rows;
  }

  async getTimelineSubscribersIds(timelineId) {
    return await this.database('subscriptions').pluck('user_id').orderBy('created_at', 'desc').where('feed_id', timelineId)
  }

  async getTimelineSubscribers(timelineIntId) {
    const responses = this.database('users').whereRaw('subscribed_feed_ids && ?', [[timelineIntId]])
    return responses.map(initUserObject)
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
};

export default subscriptionsTrait;
