import monitor from 'monitor-dog';
import { NotAuthorizedException } from '../../support/exceptions';

export function monitored(monitorName) {
  return async (ctx, next) => {
    if (!ctx.state.isMonitored) {
      await next();
      return;
    }
    ctx.state.isMonitored = true;
    const timer = monitor.timer(`${monitorName}-time`);
    try {
      await next();
      monitor.increment(`${monitorName}-requests`);
    } finally {
      timer.stop();
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
