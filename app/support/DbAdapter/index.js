import _ from 'lodash';
import redis from 'redis'
import NodeCache from 'node-cache';
import cacheManager from 'cache-manager'
import redisStore from 'cache-manager-redis'
import { promisifyAll } from 'bluebird';
import config from 'config';

import usersTrait from './users';
import usersCacheTrait from './users-cache';
import usersStatsTrait from './users-stats';
import subscrRequestsTrait from './subscr-requests';
import bansTrait from './bans';
import groupAdminsTrait from './group-admins';
import attachmentsTrait from './attachments';
import likesTrait from './likes';
import commentsTrait from './comments';
import feedsTrait from './feeds';
import postsTrait from './posts';
import timelinesPostsTrait from './timelines-posts';
import subscriptionsTrait from './subscriptions';
import localBumpsTrait from './local-bumps';
import hashtagsTrait from './hashtags';
import unreadDirectsTrait from './unread-directs';
import statsTrait from './stats';
import eventsTrait from './events';
import commentLikesTrait from './comment-likes';
import allGroupsTrait from './all-groups';
import summaryTrait from './summary';
import invitationsTrait from './invitations';
import appTokensTrait from './app-tokens';
import externalAuthTrait from './external-auth';
import serverInfoTrait from './server-info';
import searchTrait from './search';
import { withDbHelpers } from './utils';
import nowTrait from './now';
import jobsTrait from './jobs';


promisifyAll(redis.RedisClient.prototype);
promisifyAll(redis.Multi.prototype);

class DbAdapterBase {
  constructor(database) {
    this.database = withDbHelpers(database);
    this.statsCache = new NodeCache({ stdTTL: 300 });

    const CACHE_TTL = 60 * 60 * 24; // 24 hours

    this.memoryCache = cacheManager.caching({ store: 'memory', max: 5000, ttl: CACHE_TTL });
    this.cache = cacheManager.caching({
      store: redisStore,
      host:  config.redis.host,
      port:  config.redis.port,
      ttl:   CACHE_TTL,
    });

    promisifyAll(this.cache);
    promisifyAll(this.memoryCache);

    this.searchQueriesTimeout = config.performance.searchQueriesTimeout;
    this._pgVersion = null;
  }

  /**
   * Return PostgreSQL version as number (PG_VERSION_NUM)
   */
  async getPGVersion() {
    if (!this._pgVersion) {
      this._pgVersion = parseInt(await this.database.getOne('show server_version_num'), 10);
    }

    return this._pgVersion;
  }
}

// Extending DbAdapterBase by traits
export const DbAdapter = _.flow([
  usersTrait,
  usersCacheTrait,
  usersStatsTrait,
  subscrRequestsTrait,
  bansTrait,
  groupAdminsTrait,
  attachmentsTrait,
  likesTrait,
  commentsTrait,
  feedsTrait,
  postsTrait,
  timelinesPostsTrait,
  subscriptionsTrait,
  localBumpsTrait,
  hashtagsTrait,
  unreadDirectsTrait,
  statsTrait,
  eventsTrait,
  commentLikesTrait,
  allGroupsTrait,
  summaryTrait,
  invitationsTrait,
  appTokensTrait,
  externalAuthTrait,
  serverInfoTrait,
  searchTrait,
  nowTrait,
  jobsTrait,
])(DbAdapterBase);
