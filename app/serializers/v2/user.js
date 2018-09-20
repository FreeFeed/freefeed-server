import { pick, uniq } from 'lodash';

import { dbAdapter } from '../../models';

const commonUserFields = [
  'id',
  'username',
  'screenName',
  'isPrivate',
  'isProtected',
  'createdAt',
  'updatedAt',
  'type',
  'description',
  'profilePictureLargeUrl',
  'profilePictureMediumUrl',
];

const commonGroupFields = [
  ...commonUserFields,
  'isRestricted',
];

const selfUserFields = [
  ...commonUserFields,
  'email',
  'frontendPreferences',
  'privateMeta',
  'preferences',
];

export async function serializeSelfUser(user) {
  const result = pick(user, selfUserFields);

  [
    result.banIds,
    result.unreadDirectsNumber,
    result.unreadNotificationsNumber,
    result.statistics,
  ] = await Promise.all([
    user.getBanIds(),
    user.getUnreadDirectsNumber(),
    user.getUnreadNotificationsNumber(),
    user.getStatistics(),
  ]);

  return result;
}

export function serializeUser(user) {
  if (user.type === 'user') {
    return pick(user, commonUserFields);
  }
  return pick(user, commonGroupFields);
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
    Object.values(adminsAssoc).forEach((ids) => ids.forEach((s) => userIds.push(s)));
    userIds = uniq(userIds);
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
  const getSerializedUserById = userSerializerFunction(usersAssoc, statsAssoc, adminsAssoc);

  // Serialize
  return Object.keys(usersAssoc).map(getSerializedUserById);
}
