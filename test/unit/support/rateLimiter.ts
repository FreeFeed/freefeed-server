/* eslint-env node, mocha */
import expect from 'unexpected';
import { Context, Next } from 'koa';
import { v4 as uuidv4 } from 'uuid';
import { merge } from 'lodash';

import { rateLimiterMiddleware } from '../../../app/support/rateLimiter';

const MAX_ANONYMOUS_REQUESTS = 5;
const MAX_AUTHENTICATED_REQUESTS = 7;
const DURATION = 5 * 1000;

const baseContext = {
  ip: '127.0.0.1',
  state: {
    authToken: {},
  },
  config: {
    rateLimit: {
      enabled: true,
      allowlist: [],
      anonymous: {
        duration: DURATION,
        maxRequests: MAX_ANONYMOUS_REQUESTS,
      },
      authenticated: {
        duration: DURATION,
        maxRequests: MAX_AUTHENTICATED_REQUESTS,
      },
    },
  },
  request: {
    method: 'GET',
  },
} as unknown as Context;

const next: Next = async () => {};

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
    const ctx = merge({}, baseContext, { state: { authToken: { userId: uuidv4() } } });

    const requests = [];

    for (let i = 0; i < MAX_AUTHENTICATED_REQUESTS + 1; i++) {
      requests.push(rateLimiterMiddleware(ctx, next));
    }

    return expect(Promise.all(requests), 'to be rejected with', 'Slow down');
  });
});
