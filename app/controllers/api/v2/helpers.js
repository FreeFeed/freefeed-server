import monitor from 'monitor-dog';
import { NotAuthorizedException } from '../../../support/exceptions'
import { serializeUser } from '../../../serializers/v2/user';

export function monitored(monitorName, handlerFunc) {
  return async (ctx) => {
    const timer = monitor.timer(`${monitorName}-time`);
    try {
      await handlerFunc(ctx);
      monitor.increment(`${monitorName}-requests`);
    } finally {
      timer.stop();
    }
  };
}

export function authRequired(handlerFunc) {
  return async (ctx) => {
    if (!ctx.state.user) {
      throw new NotAuthorizedException();
    }
    await handlerFunc(ctx);
  };
}

const defaultStats = {
  posts:         '0',
  likes:         '0',
  comments:      '0',
  subscribers:   '0',
  subscriptions: '0',
};

/**
 * Returns function that returns serialized user by its id
 */
export function userSerializerFunction(allUsers, allStats, allGroupAdmins = {}) {
  return (id) => {
    const obj = serializeUser(allUsers[id]);
    obj.statistics = allStats[id] || defaultStats;
    if (obj.type === 'group') {
      if (!obj.isVisibleToAnonymous) {
        obj.isVisibleToAnonymous = (obj.isProtected === '1') ? '0' : '1';
      }
      obj.administrators = allGroupAdmins[obj.id] || [];
    }
    return obj;
  };
}
