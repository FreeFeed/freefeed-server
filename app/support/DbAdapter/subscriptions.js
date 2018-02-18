import { map } from 'lodash';
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

  async getUsersSubscribedToTimelines(timelineIds) {
    if (timelineIds.length === 0) {
      return [];
    }
    const { rows } = await this.database.raw(
      `select distinct user_id from subscriptions where feed_id = any(:timelineIds)`,
      { timelineIds },
    );
    return map(rows, 'user_id');
  }

  async getTimelineSubscribersIds(timelineId) {
    return await this.database('subscriptions').pluck('user_id').orderBy('created_at', 'desc').where('feed_id', timelineId)
  }

  async getTimelineSubscribers(timelineIntId) {
    const responses = await this.database('users').whereRaw('subscribed_feed_ids && ?', [[timelineIntId]]);
    return responses.map(initUserObject)
  }

  async subscribeUserToTimelines(feedIds, userId) {
    let feedIntIds;
    await this.database.transaction(async (trx) => {
      // Lock users table row
      await trx.raw('select 1 from users where uid = :userId for update', { userId });
      // Insert multiple rows from array at once
      await trx.raw(
        `insert into subscriptions (user_id, feed_id) 
         select :userId, x from unnest(:feedIds::uuid[]) x on conflict do nothing`,
        { userId, feedIds }
      );
      // Update users table
      feedIntIds = await actualizeUserSubscribedFeedIds(trx, userId);
      // Update users cache
      await this.cacheFlushUser(userId);
    });
    return feedIntIds;
  }

  async unsubscribeUserFromTimelines(feedIds, userId) {
    let feedIntIds;
    await this.database.transaction(async (trx) => {
      // Lock users table row
      await trx.raw('select 1 from users where uid = :userId for update', { userId });
      // Delete subscriptions records
      await trx.raw(
        `delete from subscriptions where user_id = :userId and feed_id = any(:feedIds)`,
        { userId, feedIds }
      );
      // Update users table
      feedIntIds = await actualizeUserSubscribedFeedIds(trx, userId);
      // Update users cache
      await this.cacheFlushUser(userId);
    });
    return feedIntIds;
  }
};

export default subscriptionsTrait;

/**
 * Update users.subscribed_feed_ids from 'subscriptions' table
 * and return the actual value
 *
 * @param {object} db DB connection or transaction
 * @param {string} userId
 * @returns {Array.<number>}
 */
async function actualizeUserSubscribedFeedIds(db, userId) {
  const { rows } = await db.raw(
    `select f.id from
        feeds f
        join subscriptions s on s.feed_id = f.uid and s.user_id = :userId`,
    { userId }
  );
  const feedIntIds = map(rows, 'id');
  await db.raw('update  users set subscribed_feed_ids = :feedIntIds where uid = :userId', { feedIntIds, userId });
  return feedIntIds;
}
