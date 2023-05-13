import _ from 'lodash';

import { prepareModelPayload } from './utils';

///////////////////////////////////////////////////
// User statistics
///////////////////////////////////////////////////

const usersStatsTrait = (superClass) =>
  class extends superClass {
    async createUserStats(userId) {
      const res = await this.database('user_stats').insert({ user_id: userId });
      return res;
    }

    async getUserStats(userId) {
      let userStats;

      // Check the cache first
      const cachedUserStats = this.statsCache.get(userId);

      if (typeof cachedUserStats != 'undefined') {
        // Cache hit
        userStats = cachedUserStats;
      } else {
        // Cache miss, read from the database
        const res = await this.database('user_stats').where('user_id', userId);
        [userStats] = res;
        this.statsCache.set(userId, userStats);
      }

      return prepareModelPayload(userStats, USER_STATS_FIELDS, {});
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
      const cachedStats = uniqIds.map((id) => this.statsCache.get(id));

      const notFoundIds = _.compact(cachedStats.map((stat, i) => (stat ? null : uniqIds[i])));
      const dbStats =
        notFoundIds.length === 0
          ? []
          : await this.database('user_stats').whereIn('user_id', notFoundIds);

      dbStats.map((stat) => this.statsCache.set(stat.user_id, stat));

      _.compact(cachedStats).forEach(
        (stat) => (idToStat[stat.user_id] = prepareModelPayload(stat, USER_STATS_FIELDS, {})),
      );
      dbStats.forEach(
        (stat) => (idToStat[stat.user_id] = prepareModelPayload(stat, USER_STATS_FIELDS, {})),
      );
      return idToStat;
    }

    async calculateUserStats(userId) {
      const userFeeds = await this.database('users')
        .select('subscribed_feed_ids')
        .where('uid', userId);
      const readableFeedsIds = userFeeds[0].subscribed_feed_ids;

      const userPostsFeed = await this.database('feeds').returning('uid').where({
        user_id: userId,
        name: 'Posts',
      });

      if (!userPostsFeed[0]) {
        // hard-reserved username without other data-structures
        return;
      }

      const userPostsFeedId = userPostsFeed[0].uid;
      const readablePostFeeds = this.database('feeds')
        .whereIn('id', readableFeedsIds)
        .where('name', 'Posts');

      const promises = [
        this.getUserPostsCount(userId),
        this.getUserLikesCount(userId),
        this.getUserCommentsCount(userId),
        this.getTimelineSubscribersIds(userPostsFeedId),
        readablePostFeeds,
      ];
      const values = await Promise.all(promises);
      const payload = {
        posts_count: values[0],
        likes_count: values[1],
        comments_count: values[2],
        subscribers_count: values[3].length,
        subscriptions_count: values[4].length,
      };

      await this.database('user_stats').where('user_id', userId).update(payload);

      // Invalidate cache
      this.statsCache.del(userId);
    }
  };

export default usersStatsTrait;

///////////////////////////////////////////////////

const USER_STATS_FIELDS = {
  posts_count: 'posts',
  likes_count: 'likes',
  comments_count: 'comments',
  subscribers_count: 'subscribers',
  subscriptions_count: 'subscriptions',
};
