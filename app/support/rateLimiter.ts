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
  const requestMethod = ctx.request.method;

  let clientId, rateLimiterConfig;

  if (ctx.state.authJWTPayload?.userId) {
    clientId = ctx.state.authJWTPayload.userId;
    rateLimiterConfig = ctx.config.rateLimit.authenticated;
  } else {
    clientId = ctx.ip;
    rateLimiterConfig = ctx.config.rateLimit.anonymous;
  }

  const requestTags = { method: requestMethod, auth: authTokenType, clientId };
  monitor.increment('requests', 1, requestTags);

  debug(
    `${requestId}: ${requestMethod} ${ctx.request.originalUrl} request from ${clientId} (${authTokenType})`,
  );

  if (ctx.config.rateLimit.enabled) {
    if (ctx.config.rateLimit.allowlist.includes(clientId)) {
      debug(`${requestId}: Client allowlisted, request allowed`);
    } else {
      const duration =
        rateLimiterConfig.methodOverrides?.[requestMethod]?.duration || rateLimiterConfig.duration;
      const maxRequests =
        rateLimiterConfig.methodOverrides?.[requestMethod]?.maxRequests ||
        rateLimiterConfig.maxRequests;

      const limit = await rateLimiter.get({
        id: clientId,
        max: maxRequests,
        duration,
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

  await next();
}
