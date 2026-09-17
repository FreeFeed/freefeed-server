import * as _ from 'lodash-es';
import NodeCache from 'node-cache';
import config from 'config';
import { Keyv } from 'keyv';
import KeyvRedis from '@keyv/redis';
import { createCache } from 'cache-manager';
import { CacheableMemory } from 'cacheable';
import {
  createBigintTypeParser,
  createDateTypeParser,
  createIntervalTypeParser,
  createNumericTypeParser,
  createPool,
} from 'slonik';

import { createResultParserInterceptor } from '../slonik/ResultParserInterceptor';

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
import visibilityTrait from './visibility';
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
import calendarTrait from './calendar';
import invitationsTrait from './invitations';
import appTokensTrait from './app-tokens';
import externalAuthTrait from './external-auth';
import serverInfoTrait from './server-info';
import searchTrait from './search';
import { withDbHelpers } from './db-helpers';
import nowTrait from './now';
import jobsTrait from './jobs';
import authSessionsTrait from './auth-sessions';
import backlinksTrait from './backlinks';
import groupBlocksTrait from './group-blocks';
import emailVerificationTrait from './email-verification';
import adminTrait from './admins';
import userStatsDynamicTrait from './user-stats-dynamic';
import translationUsageTrait from './translation-usage';
import postCommentEventsTrait from './post-comment-events';
import pinnedPostsTrait from './pinned-posts';
import documentsTrait from './documents';

class DbAdapterBase {
  /**
   * @type {import('slonik').DatabasePool} | undefined
   */
  #slonik;

  constructor(database) {
    this.database = withDbHelpers(database);
    this.statsCache = new NodeCache({ stdTTL: 300 });

    const CACHE_TTL = 60 * 60 * 24; // 24 hours
    const CACHE_TTL_MS = CACHE_TTL * 1000;

    // @keyv/redis uses @redis/client (not ioredis), so we pass URL instead of existing ioredis instance
    const redisUrl = `redis://${config.redis.host}:${config.redis.port}/${config.database}`;

    this.memoryCache = createCache({
      stores: [new Keyv({ store: new CacheableMemory({ ttl: CACHE_TTL_MS, lruSize: 5000 }) })],
    });
    this.redisStore = new KeyvRedis(redisUrl);
    this.cache = createCache({
      stores: [new Keyv({ store: this.redisStore })],
      ttl: CACHE_TTL_MS,
    });

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

  async getSlonik() {
    if (!this.#slonik) {
      const { user, password, host, port, database } = config.postgres.connection;
      const uri = new URL('postgresql://');
      uri.hostname = host;
      uri.username = user;
      uri.password = password;
      uri.port = port;
      uri.pathname = database;

      this.#slonik = await createPool(uri.href, {
        /**
         * Exclude the `createTimestampTypeParser` and
         * `createTimestampWithTimeZoneTypeParser` from the standard parsers
         * set, because we want to output timestamp(tz) type as Date object.
         *
         * @see https://github.com/gajus/slonik/issues/456#issuecomment-1823306404
         */
        typeParsers: [
          createBigintTypeParser(),
          createDateTypeParser(),
          createIntervalTypeParser(),
          createNumericTypeParser(),
        ],
        interceptors: [createResultParserInterceptor()],
      });
    }

    return this.#slonik;
  }

  doInTransaction(action) {
    if (this._inTransaction) {
      throw new Error(`Nested transactions aren't supported yet`);
    }

    return this.database.transaction(async (tx) => {
      const prevDb = this.database;
      this.database = withDbHelpers(tx);
      this._inTransaction = true;

      try {
        return await action();
      } finally {
        this.database = prevDb;
        this._inTransaction = false;
      }
    });
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
  visibilityTrait,
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
  calendarTrait,
  invitationsTrait,
  appTokensTrait,
  externalAuthTrait,
  serverInfoTrait,
  searchTrait,
  nowTrait,
  jobsTrait,
  authSessionsTrait,
  backlinksTrait,
  groupBlocksTrait,
  emailVerificationTrait,
  adminTrait,
  userStatsDynamicTrait,
  translationUsageTrait,
  postCommentEventsTrait,
  documentsTrait,
  pinnedPostsTrait,
])(DbAdapterBase);
