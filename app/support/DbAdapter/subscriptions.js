import pgFormat from 'pg-format';

import { initUserObject } from './users';
import { lockByUUID, USER_SUBSCRIPTIONS } from './adv-locks';
/** @typedef {import('../types').UUID} UUID */

///////////////////////////////////////////////////
// Subscriptions
///////////////////////////////////////////////////

const subscriptionsTrait = (superClass) =>
  class extends superClass {
    getUserSubscriptionsIds(userId) {
      return this.database('subscriptions')
        .pluck('feed_id')
        .orderBy('created_at', 'desc')
        .where('user_id', userId);
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
        { userId, timelineId },
      );
      return rows.length > 0;
    }

    /**
     * Returns map that represents the mutual subscription status between the
     * userId and one of otherUserIds. Map keys are UUIDs from the otherUserIds
     * and map values are bit masks: bit 0 means userId subscribed to this user,
     * bit 1 means this user subscribed to userId.
     *
     * @param {UUID|null} userId
     * @param {UUID[]} otherUserIds
     * @returns {Promise<Map<UUID, 0|1|2|3>>}
     */
    async getMutualSubscriptionStatuses(userId, otherUserIds) {
      const map = new Map(otherUserIds.map((id) => [id, 0]));

      if (!userId || otherUserIds.length === 0) {
        return map;
      }

      const postsFeedId = await this.database.getOne(
        `select uid from feeds where user_id = :userId and name = :name`,
        { userId, name: 'Posts' },
      );

      const rows = await this.database.getAll(
        `( -- subscriptions of userId
            select f.user_id as id, 1 as status from
            feeds f
            join subscriptions s on s.feed_id = f.uid and f.name = 'Posts'
            where s.user_id = :userId and f.user_id = any(:otherUserIds)
          )
          union all
          ( -- subscribers of userId
            select user_id as id, 2 as status from subscriptions 
            where user_id = any(:otherUserIds) and feed_id = :postsFeedId
          )
        `,
        { userId, otherUserIds, postsFeedId },
      );

      for (const { id, status } of rows) {
        map.set(id, map.get(id) | status);
      }

      return map;
    }

    /**
     * Return only those toUserIds that have a subscriberId subscribed to
     *
     * @param {UUID|null} subscriberId
     * @param {UUID[]} toUserIds
     * @returns {Promise<UUID[]>}
     */
    getOnlySubscribedTo(subscriberId, toUserIds) {
      if (!subscriberId || toUserIds.length === 0) {
        return [];
      }

      return this.database.getCol(
        `select f.user_id from
          feeds f
          join subscriptions s on s.feed_id = f.uid and f.name = 'Posts'
          where s.user_id = :subscriberId and f.user_id = any(:toUserIds)
        `,
        { subscriberId, toUserIds },
      );
    }

    async areUsersSubscribedToOneOfTimelines(userIds, timelineIds) {
      if (userIds.length === 0 || timelineIds.length === 0) {
        return [];
      }

      const q = pgFormat(
        `
      SELECT users.uid, (
        SELECT COUNT(*) > 0 FROM "subscriptions"
        WHERE "user_id"= users.uid
          and "feed_id" IN (%L)
      ) as is_subscribed FROM users
      WHERE users.uid IN (%L)
    `,
        timelineIds,
        userIds,
      );
      const res = await this.database.raw(q);

      return res.rows;
    }

    getUsersSubscribedToTimelines(timelineIds) {
      if (timelineIds.length === 0) {
        return [];
      }

      return this.database.getCol(
        `select distinct user_id from subscriptions where feed_id = any(:timelineIds)`,
        { timelineIds },
      );
    }

    async getTimelineSubscribersIds(timelineId) {
      return await this.database('subscriptions')
        .pluck('user_id')
        .orderBy('created_at', 'desc')
        .where('feed_id', timelineId);
    }

    async getTimelineSubscribers(timelineIntId) {
      const responses = await this.database('users').whereRaw('subscribed_feed_ids && ?', [
        [timelineIntId],
      ]);
      return responses.map(initUserObject);
    }

    /**
     * @param {string[]} userIds
     * @return {Promise<string[]>}
     */
    getHomeFeedSubscribedToUsers(userIds) {
      // Inherent RiverOfNews is always indirectly subscribed to it owner
      return this.database.getCol(
        `select homefeed_id from homefeed_subscriptions where target_user_id = any(:userIds)
      union
      select uid from feeds where ord is null and name = 'RiverOfNews' and user_id = any(:userIds)`,
        { userIds },
      );
    }

    /**
     * Smart subscribe one user to another
     *
     * This function performs the following updates within single transaction:
     *  - Subscription to target user feeds
     *  - Add target user to the given subscriber's home feeds (or to default one
     *    if home feeds array is empty)
     *  - Update of users.subscribed_feed_ids of subscriber
     *  - Update users' counters
     *  - Update caches
     *
     * It returns updated subscriber.subscribedFeedIds if subscription was
     * successiful or 'null' if subscriber was already subscribed to the target
     * user.
     *
     * @param {string} subscriberId - id of subscriber
     * @param {string} tagretId - id of target user
     * @param {string[]} homeFeeds - subscriber's home feeds to subscribe
     * @returns {Array.<number>|null}
     */
    async subscribeUserToUser(subscriberId, targetId, homeFeeds = []) {
      const targetFeeds = await this.getUserTimelinesIds(targetId);
      const publicTargetFeeds = ['Posts', 'Comments', 'Likes']
        .map((n) => targetFeeds[n])
        .filter(Boolean); // groups only have 'Posts' feeds

      const result = await this.database.transaction(async (trx) => {
        // Prevent other subscriberId subscription operations
        await lockByUUID(trx, USER_SUBSCRIPTIONS, subscriberId);

        // Lock users table. We plan to change it.
        await trx.raw(`select 1 from users where uid = :subscriberId for no key update`, {
          subscriberId,
        });

        if (homeFeeds.length > 0) {
          // Get and lock feeds table (we don't want any feed to be deleted.)
          homeFeeds = await trx.getCol(
            `select uid from feeds where
            uid = any(:homeFeeds) and user_id = :subscriberId and name = 'RiverOfNews'
            order by uid
            for key share`,
            { homeFeeds, subscriberId },
          );
        }

        if (homeFeeds.length === 0) {
          // This is possible when all requested feeds was deleted. Use the
          // default homefeed. We don't need to lock it because the default feed
          // canot be deleted.
          homeFeeds = await trx.getCol(
            `select uid from feeds where name = 'RiverOfNews' and ord is null
            and user_id = :subscriberId`,
            { subscriberId },
          );
        }

        // Now trying to subscribie to the public feeds
        const subscribedFeeds = await trx.getCol(
          `insert into subscriptions (user_id, feed_id)
           select :subscriberId, x from unnest(:publicTargetFeeds::uuid[]) x
           on conflict do nothing
           returning feed_id`,
          { subscriberId, publicTargetFeeds },
        );

        // Are we subscribed to the Posts feed?
        const wasSubscribed = subscribedFeeds.includes(targetFeeds.Posts);
        const subscribedFeedIds = await updateSubscribedFeedIds(trx, subscriberId);

        if (wasSubscribed) {
          // Subscribe home feeds
          await trx.raw(
            `insert into homefeed_subscriptions (homefeed_id, target_user_id)
            select hid, :targetId from unnest(:homeFeeds::uuid[]) hid
            on conflict do nothing`,
            { subscriberId, targetId, homeFeeds },
          );
        }

        // Delete subscription request if any
        await trx.raw(
          `delete from subscription_requests 
          where from_user_id = :subscriberId and to_user_id = :targetId`,
          { subscriberId, targetId },
        );

        return { wasSubscribed, subscribedFeedIds };
      });

      if (result.wasSubscribed) {
        await Promise.all([
          this.cacheFlushUser(subscriberId),
          this.statsCache.del(subscriberId),
          this.statsCache.del(targetId),
        ]);
      }

      return result;
    }

    /**
     * Returns integer ids of feeds that home feed is subscribed to. These ids are
     * separated into two groups: 'destinations' — 'Posts' and 'Directs' feeds and
     * 'activities' — 'Comments' and 'Likes'.
     *
     * @param {Timeline} homeFeed
     * @return {{destinations: number[], activities: number[]}} - ids of feeds
     */
    async getSubscriprionsIntIds(homeFeed) {
      const rows = await this.database.getAll(
        `with feeds as (
        select f.id, f.name from
          homefeed_subscriptions hs
          join feeds f on f.user_id = hs.target_user_id and f.name in ('Posts', 'Comments', 'Likes')
          where hs.homefeed_id = :homeFeedId
        ${
          homeFeed.isInherent
            ? `union  -- viewer's own feeds
        select id, name from feeds where user_id = :userId 
          and name in ('Posts', 'Directs', 'Comments', 'Likes')`
            : ``
        }
      )
      select 
        case when name in ('Comments', 'Likes') then 'activities' else 'destinations' end as type,
        array_remove(array_agg(id), null) as ids
      from feeds group by type`,
        { homeFeedId: homeFeed.id, userId: homeFeed.userId },
      );

      const result = { destinations: [], activities: [] };
      rows.forEach(({ ids, type }) => (result[type] = ids));
      return result;
    }

    /**
     * Smart unsubscribe one user from another
     *
     * This function performs all necessary database updates within single
     * transaction:
     *  - Unsubscription from target user feeds
     *  - Update of users.subscribed_feed_ids of subscriber
     *  - Update users' counters
     *  - Update caches
     *
     * @param {object} subscriber - subscriber object
     * @param {string} subscriberId - id of subscriber
     * @param {string} tagretId - id of target user
     * @returns {Promise<object>}
     */
    async unsubscribeUserFromUser(subscriberId, targetId) {
      const result = await this.database.transaction(async (trx) => {
        // Prevent other subscriberId subscription operations
        await lockByUUID(trx, USER_SUBSCRIPTIONS, subscriberId);

        // Lock users table. We plan to change it.
        await trx.raw(`select 1 from users where uid = :subscriberId for no key update`, {
          subscriberId,
        });

        // Trying to unsubscribie from all feeds
        const feedNames = await trx.getCol(
          `delete from subscriptions s using feeds f
          where
            s.user_id = :subscriberId
            and f.user_id = :targetId
            and f.uid = s.feed_id
          returning f.name`,
          { subscriberId, targetId },
        );

        // In any case, unsubscribe all home feeds
        await trx.raw(
          `delete from homefeed_subscriptions using feeds h 
          where
            homefeed_id = h.uid
            and target_user_id = :targetId
            and h.user_id = :subscriberId
            and h.name = 'RiverOfNews'`,
          { subscriberId, targetId },
        );

        const wasUnsubscribed = feedNames.includes('Posts');
        const subscribedFeedIds = await updateSubscribedFeedIds(trx, subscriberId);

        // Delete subscription request if any
        await trx.raw(
          `delete from subscription_requests 
          where from_user_id = :subscriberId and to_user_id = :targetId`,
          { subscriberId, targetId },
        );

        return { wasUnsubscribed, subscribedFeedIds };
      });

      if (result.wasUnsubscribed) {
        await Promise.all([
          this.cacheFlushUser(subscriberId),
          this.statsCache.del(subscriberId),
          this.statsCache.del(targetId),
        ]);
      }

      return result;
    }

    /**
     * Updates the set of subscriber's home feeds that are subscribed to the
     * target user. The subscriber must be subscribed to the target user.
     *
     * @param {string} subscriberId
     * @param {string} targetId
     * @param {string[]} homeFeeds
     * @returns {Promise<boolean>} - false if the subscriber is not subscribed to
     * the target
     */
    async updateSubscription(subscriberId, targetId, homeFeeds) {
      const targetPostsFeed = await this.getUserNamedFeedId(targetId, 'Posts');

      return await this.database.transaction(async (trx) => {
        // Prevent other subscriberId subscription operations
        await lockByUUID(trx, USER_SUBSCRIPTIONS, subscriberId);

        // Check the subscription
        const isSubscribed = await trx.getOne(
          `select true from subscriptions where feed_id = :targetPostsFeed and user_id = :subscriberId`,
          { targetPostsFeed, subscriberId },
        );

        if (!isSubscribed) {
          return false;
        }

        // Get and lock feeds table (we don't want any feed to be deleted.)
        homeFeeds = await trx.getCol(
          `select uid from feeds where
            uid = any(:homeFeeds) and user_id = :subscriberId and name = 'RiverOfNews'
            order by uid
            for key share`,
          { homeFeeds, subscriberId },
        );

        // Remove target from all subscriber's home feeds
        await trx.raw(
          `delete from homefeed_subscriptions 
          using feeds h where
          homefeed_id = h.uid and target_user_id = :targetId
          and h.user_id = :subscriberId`,
          { subscriberId, targetId },
        );

        // Add target to the desired feeds
        if (homeFeeds.length > 0) {
          await trx.raw(
            `insert into homefeed_subscriptions (homefeed_id, target_user_id)
            select hid, :targetId from unnest(:homeFeeds::uuid[]) hid
            on conflict do nothing`,
            { subscriberId, targetId, homeFeeds },
          );
        }

        return true;
      });
    }

    /**
     * Return UIDs of all subscriber's home feeds that subscribed to the target
     *
     * @param {string} subscriberId
     * @param {string} targetId
     * @returns {Promise<string[]>}
     */
    async getHomeFeedsSubscribedTo(subscriberId, targetId) {
      return await this.database.getCol(
        `select h.uid
        from
          feeds h
          join homefeed_subscriptions s on s.homefeed_id = h.uid
        where
          h.user_id = :subscriberId 
          and s.target_user_id = :targetId`,
        { subscriberId, targetId },
      );
    }

    /**
     * Returns all users that subscriber subscribed to with the home feeds. The
     * result is array of objects like: { user_id: ..., homefeed_ids: [...] }
     *
     * @param {string} subscriberId
     * @returns {Promise<object[]>}
     */
    async getSubscriptionsWithHomeFeeds(subscriberId) {
      return await this.database.getAll(
        `with homefeeds as (
          select * from feeds
            where user_id = :subscriberId and name = 'RiverOfNews'
        ),
        users as (
          select f.user_id, s.created_at as date from
            subscriptions s
            join feeds f on f.uid = s.feed_id and f.name = 'Posts'
            where s.user_id = :subscriberId
        )
      select u.user_id, array_remove(array_agg(h.uid), null) as homefeed_ids from
        users u
        left join homefeed_subscriptions hs on hs.target_user_id = u.user_id
        left join homefeeds h on hs.homefeed_id = h.uid
        group by u.user_id, u.date
        order by u.date desc`,
        { subscriberId },
      );
    }

    getHomeFeedSubscriptions(feedId) {
      return this.database.getCol(
        `select target_user_id from homefeed_subscriptions where homefeed_id = :feedId`,
        { feedId },
      );
    }

    /**
     * The home feed hide list is a list of users/groups on which the feed owner
     * is subscribed but the feed itself is not. So if F is all feed owner's
     * friends and S is all feed subscriptions, then the hide list H = F - S.
     *
     * This function returns *intIds* of hide list users *Posts* feeds.
     *
     * @param {Timeline} homeFeed
     * @returns {Promise<number[]>}
     */
    getHomeFeedHideListPostIntIds(homeFeed) {
      return this.database.getCol(
        `with friends as (
          select f.user_id, f.id from
            subscriptions s
            join feeds f on f.uid = s.feed_id and f.name = 'Posts'
          where s.user_id = :ownerId
        )
        select f.id from 
          friends f
          left join homefeed_subscriptions hs on 
            hs.target_user_id = f.user_id and hs.homefeed_id = :feedId
         where
          hs.target_user_id is null`,
        { feedId: homeFeed.id, ownerId: homeFeed.userId },
      );
    }

    /**
     * The home feed hide list is a list of users/groups on which the feed owner
     * is subscribed but the feed itself is not. So if F is all feed owner's
     * friends and S is all feed subscriptions, then the hide list H = F - S.
     *
     * This function returns hide lists of the several home feeds as object
     * { feedId: [userId1, userId2…] }
     */
    async getHomeFeedsHideLists(feedIds) {
      const rows = await this.database.getAll(
        `with 
        -- Home feeds
        homefeeds as (
          select uid, user_id from
            feeds where uid = any(:feedIds) and name = 'RiverOfNews'
        ),
        -- All owner's friends by home feed ID
        friends as (
          select h.uid as homefeed_id, f.user_id as target_user_id from
            subscriptions s
            join homefeeds h on s.user_id = h.user_id
            join feeds f on f.uid = s.feed_id and f.name = 'Posts'
        ),
        -- All selected home feeds subscriptions
        subscriptions as (
          select * from
            homefeed_subscriptions hs
            join homefeeds h on hs.homefeed_id = h.uid
        )
      select
        f.homefeed_id,
        array_remove(array_agg(f.target_user_id), null) as hide_list
      from
        friends f
        left join subscriptions s on 
          s.homefeed_id = f.homefeed_id and s.target_user_id = f.target_user_id
        where 
          s.target_user_id is null
        group by f.homefeed_id`,
        { feedIds },
      );
      const result = {};

      for (const { homefeed_id, hide_list } of rows) {
        result[homefeed_id] = hide_list;
      }

      for (const feedId of feedIds) {
        if (!result[feedId]) {
          result[feedId] = [];
        }
      }

      return result;
    }

    async updateHomeFeedSubscriptions(feedId, userIds) {
      const feed = await this.getTimelineById(feedId);

      if (feed.name !== 'RiverOfNews') {
        throw new Error(`Invalid feed type: ${feed.name} ('RiverOfNews' required)`);
      }

      await this.database.transaction(async (trx) => {
        // Prevent other subscriberId subscription operations
        await lockByUUID(trx, USER_SUBSCRIPTIONS, feed.userId);

        // Lock the feed
        const ok = trx.getOne(
          `select true from feeds
        where uid = :feedId for key share`,
          { feedId },
        );

        if (!ok) {
          throw new Error(`Feed is not exists`);
        }

        if (userIds.length > 0) {
          // Only users feed owner subscribed to
          userIds = await trx.getCol(
            `select f.user_id from 
            feeds f
            join subscriptions s on f.uid = s.feed_id
            where
              s.user_id = :subscriberId
              and f.name = 'Posts'
              and f.user_id = any(:userIds)`,
            { subscriberId: feed.userId, userIds },
          );
        }

        await trx.raw(`delete from homefeed_subscriptions where homefeed_id = :feedId`, { feedId });

        if (userIds.length > 0) {
          await trx.raw(
            `insert into homefeed_subscriptions (homefeed_id, target_user_id)
              select :feedId, id from unnest(:userIds::uuid[]) id
              on conflict do nothing`,
            { feedId, userIds },
          );
        }
      });
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
 * @returns {Promise<number[]>} - new value of subscribed_feed_ids
 */
async function updateSubscribedFeedIds(db, subscriberId) {
  const {
    rows: [{ feed_ids }],
  } = await db.raw(
    `select
      coalesce(array_agg(f.id), '{}') as feed_ids
    from
      feeds f
      join subscriptions s on s.feed_id = f.uid and s.user_id = :subscriberId`,
    { subscriberId },
  );
  await db.raw('update users set subscribed_feed_ids = :feed_ids where uid = :subscriberId', {
    feed_ids,
    subscriberId,
  });
  return feed_ids;
}
