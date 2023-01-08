import monitor from 'monitor-dog'; // search keyword: datadog
import { Context, Next } from 'koa';
import RateLimiter from 'async-ratelimiter';
import Redis from 'ioredis';
import config from 'config';

import { TooManyRequestsException } from './exceptions';

const options = {
  host: config.redis.host,
  port: config.redis.port,
  db: config.database,
};
const rateLimiter = new RateLimiter({
  db: new Redis(options),
});

export async function rateLimiterMiddleware(ctx: Context, next: Next) {
  const authTokenType = ctx.state.authJWTPayload?.type || 'anonymous';
  monitor.increment('requests', 1, { method: ctx.request.method, auth: authTokenType });

  if (ctx.config.rateLimit.enabled) {
    let id, maxRequests, duration;

    if (ctx.state.authToken?.userId) {
      id = ctx.state.authToken.userId;
      ({ maxRequests, duration } = ctx.config.rateLimit.authenticated);
    } else {
      id = ctx.ip;
      ({ maxRequests, duration } = ctx.config.rateLimit.anonymous);
    }

    const limit = await rateLimiter.get({ id, max: maxRequests, duration });

    if (!limit.remaining) {
      monitor.increment('requests-rate-limited', 1, { id });
      throw new TooManyRequestsException('Slow down');
    }
  }

  await next();
}
