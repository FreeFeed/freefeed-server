import crypto from 'crypto';

import cacheManager, { Cache as MCache } from 'cache-manager';
import redisStore from 'cache-manager-ioredis';
import { promisifyAll } from 'bluebird';
import config from 'config';

const KEY_LENGTH = 16; // bytes

promisifyAll(crypto);

/**
 * Wrapper for the redis-based cache with auto-generated and auto-prefixed keys
 */
export class Cache {
  private readonly cache: MCache;

  constructor(private readonly keyPrefix: string, private readonly ttl: number) {
    this.cache = cacheManager.caching({
      store: redisStore,
      host: config.redis.host,
      port: config.redis.port,
      db: config.database,
      ttl,
    });
  }

  async put<T>(data: T) {
    const key = crypto.randomBytes(KEY_LENGTH).toString('base64');
    await this.cache.set(this.keyPrefix + key, data, this.ttl);
    return key;
  }

  async update<T>(key: string, data: T) {
    await this.cache.set(this.keyPrefix + key, data, this.ttl);
  }

  get<T>(key: string): Promise<T | undefined> {
    return this.cache.get(this.keyPrefix + key);
  }

  async delete(key: string) {
    await this.cache.del(this.keyPrefix + key);
  }
}
