/* eslint-env node, mocha */
import expect from 'unexpected';
import { Context, Next } from 'koa';
import { v4 as uuidv4 } from 'uuid';
import { merge } from 'lodash';

import { rateLimiterMiddleware, durationToSeconds } from '../../../app/support/rateLimiter';

const MAX_ANONYMOUS_REQUESTS = 3;
const MAX_AUTHENTICATED_REQUESTS = 5;
const DURATION = 'PT5S';
const BLOCK_DURATION = 'PT5S';
const BLOCK_MULTIPLIER = 2;

const baseContext = {
  ip: '127.0.0.1',
  state: {
    authJWTPayload: {},
  },
  config: {
    rateLimit: {
      enabled: true,
      allowlist: [],
      anonymous: {
        duration: DURATION,
        maxRequests: {
          all: MAX_ANONYMOUS_REQUESTS,
        },
      },
      authenticated: {
        duration: DURATION,
        maxRequests: {
          all: MAX_AUTHENTICATED_REQUESTS,
        },
      },
      blockDuration: BLOCK_DURATION,
      repeatBlockCounterDuration: 'PT1M',
      repeatBlockMultiplier: BLOCK_MULTIPLIER,
    },
  },
  request: {
    method: 'GET',
  },
} as unknown as Context;

const next: Next = async () => {};

function sleep(sec: number) {
  console.log('Sleeping', sec);
  return new Promise((resolve) => setTimeout(resolve, sec * 1000));
}

describe('Rate limiter', () => {
  it('should allow too many requests if rate limiter is disabled', () => {
    const ctx = merge({}, baseContext, { config: { rateLimit: { enabled: false } } });

    const requests = [];

    for (let i = 0; i < MAX_ANONYMOUS_REQUESTS + 1; i++) {
      requests.push(rateLimiterMiddleware(ctx, next));
    }

    return expect(Promise.all(requests), 'to be fulfilled');
  });

  it('should allow too many requests if client is allowlisted', () => {
    const ctx = merge({}, baseContext, {
      config: { rateLimit: { enabled: true, allowlist: ['127.0.0.1'] } },
    });

    const requests = [];

    for (let i = 0; i < MAX_ANONYMOUS_REQUESTS + 1; i++) {
      requests.push(rateLimiterMiddleware(ctx, next));
    }

    return expect(Promise.all(requests), 'to be fulfilled');
  });

  it('should not allow too many requests if rate limiter is enabled', () => {
    const ctx = merge({}, baseContext, {
      state: { authJWTPayload: { type: 'sess.v1', userId: uuidv4() } },
    });

    const requests = [];

    for (let i = 0; i < MAX_AUTHENTICATED_REQUESTS + 1; i++) {
      requests.push(rateLimiterMiddleware(ctx, next));
    }

    return expect(Promise.all(requests), 'to be rejected with', 'Slow down');
  });

  it('should block for a configurable amount of time', async () => {
    const ctx = merge({}, baseContext, {
      config: { rateLimit: { enabled: true } },
      state: { authJWTPayload: { type: 'sess.v1', userId: uuidv4() } },
    });

    const blockDurationInSeconds = durationToSeconds(BLOCK_DURATION);

    for (let i = 0; i < MAX_AUTHENTICATED_REQUESTS; i++) {
      // eslint-disable-next-line no-await-in-loop
      await expect(() => rateLimiterMiddleware(ctx, next), 'to be fulfilled');
    }

    // send too many requests and get blocked for the first time
    await expect(() => rateLimiterMiddleware(ctx, next), 'to be rejected with', 'Slow down');

    // wait for half of block time
    await sleep(blockDurationInSeconds / 2);

    // should still be blocked
    await expect(() => rateLimiterMiddleware(ctx, next), 'to be rejected with', 'Slow down');

    // wait more so block expires
    await sleep(blockDurationInSeconds);

    // should no longer be blocked
    for (let i = 0; i < MAX_AUTHENTICATED_REQUESTS; i++) {
      // eslint-disable-next-line no-await-in-loop
      await expect(() => rateLimiterMiddleware(ctx, next), 'to be fulfilled');
    }

    // send too many requests and get blocked for the second time
    await expect(() => rateLimiterMiddleware(ctx, next), 'to be rejected with', 'Slow down');

    // wait for more than normal full block time but less than block * multiplier time
    await sleep(blockDurationInSeconds * BLOCK_MULTIPLIER * 0.75);

    // should still be blocked because of multiplier
    await expect(() => rateLimiterMiddleware(ctx, next), 'to be rejected with', 'Slow down');

    // wait more so block expires
    await sleep(blockDurationInSeconds * BLOCK_MULTIPLIER);

    // should no longer be blocked
    return expect(rateLimiterMiddleware(ctx, next), 'to be fulfilled');
  });
});
