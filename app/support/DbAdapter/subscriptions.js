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

  async isUserSubscribedToTimeline(userId, timelineId) {
    const { rows } = await this.database.raw(
      'select 1 from subscriptions where feed_id = :timelineId and user_id = :userId',
      { userId, timelineId }
    )
    return rows.length > 0;
  }

  async areUsersMutuallySubscribed(userAId, userBId) {
    const { rows } = await this.database.raw(
      ` 
      -- A subscribed to B 
      select 1 from 
        subscriptions s join feeds f on f.uid = s.feed_id 
        where s.user_id = :userAId and f.user_id = :userBId and f.name = 'Posts' 
      union all 
      -- B subscribed to A 
      select 1 from 
        subscriptions s join feeds f on f.uid = s.feed_id 
        where s.user_id = :userBId and f.user_id = :userAId and f.name = 'Posts' 
      `,
      { userAId, userBId }
    )
    return rows.length === 2;
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

  /**
   * Smart subscribe one user to another
   *
   * This function performs the following updates within
   * single transaction:
   *  - Subscription to target user feeds
   *  - Update of users.subscribed_feed_ids of subscriber
   *
   * It returns updated subscriber.subscribedFeedIds if subscription was
   * successiful or 'null' if subscriber was already subscribed to the
   * target user.
   *
   * @param {object} subscriber - subscriber object
   * @param {string} subscriberId - id of subscriber
   * @param {string} tagretId - id of target user
   * @returns {Array.<number>|null}
   */
  async subscribeUserToUser(subscriberId, targetId) {
    let subscribedFeedIds = null;

    const allFeeds = await this.getUserTimelinesIds(targetId);
    const publicFeedIds = ['Posts', 'Comments', 'Likes']
      .map((n) => allFeeds[n])
      .filter(Boolean); // groups only have 'Posts' feeds

    await this.database.transaction(async (trx) => {
      // Lock users table
      await trx.raw('select 1 from users where uid = :subscriberId for update', { subscriberId });

      // Trying to subscribie to the public feeds
      const { rows } = await trx.raw(
        `insert into subscriptions (user_id, feed_id)
           select :subscriberId, x from unnest(:publicFeedIds::uuid[]) x on conflict do nothing
           returning feed_id`,
        { subscriberId, publicFeedIds }
      );

      // Are we subscribed to the Posts feed?
      if (!rows.some((row) => row.feed_id === allFeeds.Posts)) {
        return;
      }

      subscribedFeedIds = await updateSubscribedFeedIds(trx, subscriberId);
    });

    return subscribedFeedIds;
  }

  /**
   * Smart unsubscribe one user from another
   *
   * This function performs all necessary database updates within
   * single transaction:
   *  - Unsubscription from target user feeds
   *  - Update of users.subscribed_feed_ids of subscriber
   *
   * It returns updated subscriber.subscribedFeedIds if subscription was
   * successiful or 'null' if subscriber was already subscribed to the
   * target user.
   *
   * @param {object} subscriber - subscriber object
   * @param {string} subscriberId - id of subscriber
   * @param {string} tagretId - id of target user
   * @returns {Array.<number>|null}
   */
  async unsubscribeUserFromUser(subscriberId, targetId) {
    let subscribedFeedIds = null;

    await this.database.transaction(async (trx) => {
      // Lock users table
      await trx.raw('select 1 from users where uid = :subscriberId for update', { subscriberId });

      // Trying to unsubscribie from all feeds
      const { rows } = await trx.raw(
        `delete from subscriptions s using feeds f
          where
            s.user_id = :subscriberId
            and f.user_id = :targetId
            and f.uid = s.feed_id
          returning f.name`,
        { subscriberId, targetId }
      );

      // Was subscribed to the Posts feed?
      if (!rows.some((row) => row.name === 'Posts')) {
        return;
      }

      subscribedFeedIds = await updateSubscribedFeedIds(trx, subscriberId);
    });

    return subscribedFeedIds;
  }
};

export default subscriptionsTrait;

/**
 * Update subscriber data after subscribe/unsubscribe
 *
 * This function performs:
 *  - Update of users.subscribed_feed_ids of subscriber
 *
 * @param {object} db - DB connection or transaction
 * @param {string} subscriberId - id of subscriber
 * @returns {Array.<number>} - new value of subscribed_feed_ids
 */
async function updateSubscribedFeedIds(db, subscriberId) {
  const { rows:[{ feed_ids }] } = await db.raw(
    `select
      coalesce(array_agg(f.id), '{}') as feed_ids
    from
      feeds f
      join subscriptions s on s.feed_id = f.uid and s.user_id = :subscriberId`,
    { subscriberId }
  );
  await db.raw('update users set subscribed_feed_ids = :feed_ids where uid = :subscriberId', { feed_ids, subscriberId });
  return feed_ids;
}
