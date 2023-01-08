import monitor from 'monitor-dog'; // search keyword: datadog
import { Context, Next } from 'koa';
import RateLimiter from 'async-ratelimiter';
import Redis from 'ioredis';
import config from 'config';
import createDebug from 'debug';

import { TooManyRequestsException } from './exceptions';

const debug = createDebug('freefeed:rateLimiter');

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
  const requestId = ctx.state.id;

  let clientId, rateLimiterConfig;

  if (ctx.state.authToken?.userId) {
    clientId = ctx.state.authToken.userId;
    rateLimiterConfig = ctx.config.rateLimit.authenticated;
  } else {
    clientId = ctx.ip;
    rateLimiterConfig = ctx.config.rateLimit.anonymous;
  }

  const requestTags = { method: ctx.request.method, auth: authTokenType, clientId };
  monitor.increment('requests', 1, requestTags);

  debug(
    `${requestId}: ${ctx.request.method} ${ctx.request.originalUrl} request from ${clientId} (${authTokenType})`,
  );

  if (ctx.config.rateLimit.enabled) {
    const limit = await rateLimiter.get({
      id: clientId,
      max: rateLimiterConfig.maxRequests,
      duration: rateLimiterConfig.duration,
    });

    debug(
      `${requestId}: Remaining tokens: ${limit.remaining}, max ${rateLimiterConfig.maxRequests}`,
    );

    if (!limit.remaining) {
      monitor.increment('requests-rate-limited', 1, requestTags);
      debug(`${requestId}: Request blocked`);
      throw new TooManyRequestsException('Slow down');
    } else {
      debug(`${requestId}: Request allowed`);
    }
  } else {
    debug(`${requestId}: Rate limiter not enabled`);
  }

  await next();
}
