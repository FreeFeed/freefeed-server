import crypto from 'crypto';

import monitor from 'monitor-dog'; // search keyword: datadog
import { Context, Next } from 'koa';
import RateLimiter from 'async-ratelimiter';
import Redis from 'ioredis';
import config from 'config';
import createDebug from 'debug';
import { Duration } from 'luxon';

import { TooManyRequestsException } from './exceptions';

const debug = createDebug('freefeed:rateLimiter');

const options = {
  host: config.redis.host,
  port: config.redis.port,
  db: config.database,
};
const redis = new Redis(options);
const rateLimiter = new RateLimiter({
  db: redis,
});

const MASKING_KEY = 'masking-key';
const maskingKeyRotationIntervalSeconds =
  Duration.fromISO(config.rateLimit.maskingKeyRotationInterval).toMillis() * 1000;

const changeMaskingKey = async () => {
  const newMaskingKey = crypto.randomBytes(64).toString('hex');
  await redis.set(MASKING_KEY, newMaskingKey, 'EX', maskingKeyRotationIntervalSeconds);
  return newMaskingKey;
};

const maskClientId = (clientId: string, key: string): string => {
  return crypto.createHmac('sha1', key).update(clientId).digest('hex');
};

export async function rateLimiterMiddleware(ctx: Context, next: Next) {
  const authTokenType = ctx.state.authJWTPayload?.type || 'anonymous';
  const requestId = ctx.state.id;
  const requestMethod = ctx.request.method;

  let realClientId, maskedClientId, rateLimiterConfig;

  let maskingKey = await redis.get(MASKING_KEY);

  if (!maskingKey) {
    maskingKey = await changeMaskingKey();
  }

  if (ctx.state.authJWTPayload?.userId) {
    realClientId = ctx.state.authJWTPayload.userId;
    maskedClientId = `u-${maskClientId(realClientId, maskingKey)}`;
    rateLimiterConfig = ctx.config.rateLimit.authenticated;
  } else {
    realClientId = ctx.ip;
    maskedClientId = `a-${maskClientId(realClientId, maskingKey)}`;
    rateLimiterConfig = ctx.config.rateLimit.anonymous;
  }

  const requestTags = { method: requestMethod, auth: authTokenType, clientId: maskedClientId };
  monitor.increment('requests', 1, requestTags);

  debug(
    `${requestId}: ${requestMethod} ${ctx.request.originalUrl} request from ${realClientId} (${authTokenType})`,
  );

  if (ctx.config.rateLimit.enabled) {
    if (ctx.config.rateLimit.allowlist.includes(realClientId)) {
      debug(`${requestId}: Client allowlisted, request allowed`);
    } else {
      const methodOverride = rateLimiterConfig.methodOverrides?.[requestMethod];
      const duration = methodOverride?.duration || rateLimiterConfig.duration;
      const maxRequests = methodOverride?.maxRequests || rateLimiterConfig.maxRequests;

      const limit = await rateLimiter.get({
        id: realClientId,
        max: maxRequests,
        duration: Duration.fromISO(duration).toMillis(),
      });

      debug(`${requestId}: Remaining requests: ${limit.remaining}, max ${limit.total}`);

      if (!limit.remaining) {
        monitor.increment('requests-rate-limited', 1, requestTags);
        debug(`${requestId}: Client blocked until ${limit.reset}, request denied`);
        throw new TooManyRequestsException('Slow down');
      } else {
        debug(`${requestId}: Request allowed`);
      }
    }
  } else {
    debug(`${requestId}: Rate limiter not enabled`);
  }

  const keyTTL = await redis.ttl(MASKING_KEY);

  if (keyTTL < maskingKeyRotationIntervalSeconds / 10) {
    await changeMaskingKey();
  }

  await next();
}
