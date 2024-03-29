import monitorDog from 'monitor-dog';

import { NotAuthorizedException } from '../../support/exceptions';

/**
 * Middleware that monitors requests count and duration
 *
 * @param {string|{timer: string, requests: string}} monitorName
 * @param {typeof monitorDog} monitor
 */
export function monitored(monitorName, tags = {}, monitor = monitorDog) {
  return async (ctx, next) => {
    if (ctx.state.isMonitored) {
      await next();
      return;
    }

    ctx.state.isMonitored = true;

    let timerName, requestsName;

    if (typeof monitorName === 'string') {
      timerName = `${monitorName}-time`;
      requestsName = `${monitorName}-requests`;
    } else {
      ({ timer: timerName, requests: requestsName } = monitorName);
    }

    const timer = monitor.timer(timerName, true, tags);

    if (ctx.serverTiming) {
      ctx.serverTiming.start('controller', timerName);
    }

    try {
      await next();
      const authTokenType = ctx.state.authJWTPayload?.type || 'anonymous';
      monitor.increment(requestsName, 1, { ...tags, auth: authTokenType });
    } finally {
      timer.stop();

      if (ctx.serverTiming) {
        ctx.serverTiming.stop('controller');
      }

      Reflect.deleteProperty(ctx.state, 'isMonitored');
    }
  };
}

export function authRequired() {
  return async (ctx, next) => {
    if (!ctx.state.user) {
      throw new NotAuthorizedException();
    }

    await next();
  };
}

export { postAccessRequired } from './post-access-required';
export { targetUserRequired } from './target-user-required';
export { inputSchemaRequired } from './input-schema-required';
export { commentAccessRequired } from './comment-access-required';

/**
 *
 * @param {import("koa").Middleware} mw
 * @param {import("koa").COntext} ctx
 * @returns {Promise<void>}
 */
export async function applyMiddleware(mw, ctx) {
  await new Promise((resolve, reject) => mw(ctx, resolve).then((x) => x, reject));
}
