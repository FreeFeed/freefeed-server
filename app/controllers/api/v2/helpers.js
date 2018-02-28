import _ from 'lodash';
import monitor from 'monitor-dog';
import { NotAuthorizedException, NotFoundException } from '../../../support/exceptions'
import { serializeUser } from '../../../serializers/v2/user';
import { dbAdapter } from '../../../models';

export function monitored(monitorName, handlerFunc) {
  if (!handlerFunc) {
    return _.partial(monitored, monitorName);
  }
  return async (ctx) => {
    if (ctx.state.isMonitored) {
      // This call is already monitored
      await handlerFunc(ctx);
      return;
    }
    ctx.state.isMonitored = true;
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

export function targetUserRequired(handlerFunc) {
  return async (ctx) => {
    if (!ctx.params.username) {
      throw new NotFoundException(`Target user is not defined`);
    }
    const { username } = ctx.params;
    const targetUser = await dbAdapter.getFeedOwnerByUsername(username);
    if (!targetUser || !targetUser.isActive) {
      throw new NotFoundException(`User "${username}" is not found`);
    }
    ctx.state.targetUser = targetUser;
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
 * @param {Array.<string>} ids
 * @returns {Array}
 */
export async function serializeUsersByIds(userIds) {
  // Complement userIds array by the group admins
  const adminsAssoc = await dbAdapter.getGroupsAdministratorsIds(userIds);
  _.values(adminsAssoc).forEach((ids) => ids.forEach((s) => userIds.push(s)));
  userIds = _.uniq(userIds);

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
