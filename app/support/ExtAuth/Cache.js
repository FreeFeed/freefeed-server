import crypto from 'crypto';

import cacheManager from 'cache-manager'
import redisStore from 'cache-manager-ioredis'
import { promisifyAll } from 'bluebird';
import config from 'config';


const KEY_LENGTH = 16; // bytes

promisifyAll(crypto);

/**
 * Wrapper for the redis-based cache with auto-generated and auto-prefixed keys
 */
export class Cache {
  keyPrefix = '';
  cache = null;

  constructor(keyPrefix, ttl) {
    this.keyPrefix = keyPrefix;
    this.cache = cacheManager.caching({
      store: redisStore,
      host:  config.redis.host,
      port:  config.redis.port,
      db:    config.database,
      ttl,
    });
  }

  async put(data) {
    const buf = await crypto.randomBytesAsync(KEY_LENGTH);
    const key = buf.toString('base64');
    await this.cache.set(this.keyPrefix + key, data);
    return key;
  }

  async update(key, data) {
    await this.cache.set(this.keyPrefix + key, data);
  }

  async get(key) {
    return await this.cache.get(this.keyPrefix + key);
  }

  async delete(key) {
    await this.cache.del(this.keyPrefix + key);
  }
}


