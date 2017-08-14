import _ from 'lodash';
import redis from 'redis'
import NodeCache from 'node-cache';
import cacheManager from 'cache-manager'
import redisStore from 'cache-manager-redis'
import { promisifyAll } from 'bluebird';

import { load as configLoader } from '../../../config/config';

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
import subscriptionsTrait from './subscriptions';
import localBumpsTrait from './local-bumps';
import searchTrait from './search';
import hashtagsTrait from './hashtags';
import unreadDirectsTrait from './unread-directs';
import statsTrait from './stats';
import eventsTrait from './events';
import commentLikesTrait from './comment-likes';
import allGroupsTrait from './all-groups';

promisifyAll(redis.RedisClient.prototype);
promisifyAll(redis.Multi.prototype);

class DbAdapterBase {
  constructor(database) {
    this.database = database;
    this.statsCache = promisifyAll(new NodeCache({ stdTTL: 300 }));

    const config = configLoader();

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
    promisifyAll(this.cache.store);
  }

  /**
   * Executes SERIALIZABLE transaction until it succeeds
   * @param transaction
   */
  async executeSerizlizableTransaction(transaction) {
    while (true) {  // eslint-disable-line no-constant-condition
      try {
        await this.database.transaction(async (trx) => {  // eslint-disable-line no-await-in-loop
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
  subscriptionsTrait,
  localBumpsTrait,
  searchTrait,
  hashtagsTrait,
  unreadDirectsTrait,
  statsTrait,
  eventsTrait,
  commentLikesTrait,
  allGroupsTrait,
])(DbAdapterBase);
