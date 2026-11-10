import crypto from 'crypto';

import config from 'config';
import { Keyv } from 'keyv';
import KeyvRedis from '@keyv/redis';
import { createCache } from 'cache-manager';
import type { Cache as TCache } from 'cache-manager';

const KEY_LENGTH = 16; // bytes

/**
 * Wrapper for the redis-based cache with auto-generated and auto-prefixed keys
 */
export class Cache {
  private readonly cache: TCache;
  private readonly keyPrefix: string;
  private readonly ttl: number;

  constructor(keyPrefix: string, ttl: number) {
    this.keyPrefix = keyPrefix;
    this.ttl = ttl;
    const redisUrl = `redis://${config.redis.host}:${config.redis.port}/${config.database}`;
    this.cache = createCache({
      stores: [new Keyv({ store: new KeyvRedis(redisUrl) })],
      ttl: ttl * 1000, // cache-manager v7 uses milliseconds
    });
  }

  async put<T>(data: T) {
    const key = crypto.randomBytes(KEY_LENGTH).toString('base64');
    await this.cache.set(this.keyPrefix + key, data, this.ttl * 1000);
    return key;
  }

  async update<T>(key: string, data: T) {
    await this.cache.set(this.keyPrefix + key, data, this.ttl * 1000);
  }

  get<T>(key: string): Promise<T | undefined> {
    return this.cache.get(this.keyPrefix + key);
  }

  async delete(key: string) {
    await this.cache.del(this.keyPrefix + key);
  }
}
