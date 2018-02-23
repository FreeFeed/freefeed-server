import _ from 'lodash';
import monitor from 'monitor-dog';
import { NotAuthorizedException } from '../../../support/exceptions'
import { serializeUser } from '../../../serializers/v2/user';
import { dbAdapter } from '../../../models';

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

/**
 * Serialises users by their ids
 *
 * @param {Array.<string>} userIds
 * @param {boolean} withAdmins
 * @returns {Array}
 */
export async function serializeUsersByIds(userIds, withAdmins = true) {
  const adminsAssoc = await dbAdapter.getGroupsAdministratorsIds(userIds);
  if (withAdmins) {
    // Complement userIds array by the group admins
    _.values(adminsAssoc).forEach((ids) => ids.forEach((s) => userIds.push(s)));
    userIds = _.uniq(userIds);
  }

  // Select users and their stats
  const [
    usersAssoc,
    statsAssoc,
  ] = await Promise.all([
    dbAdapter.getUsersByIdsAssoc(userIds),
    dbAdapter.getUsersStatsAssoc(userIds),
  ]);

  // Create serializer
  const serializeUser = userSerializerFunction(usersAssoc, statsAssoc, adminsAssoc);

  // Serialize
  return Object.keys(usersAssoc).map(serializeUser);
}
