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

const commonGroupFields = [...commonUserFields, 'isRestricted'];

const selfUserFields = [
  ...commonUserFields,
  'email',
  'frontendPreferences',
  'privateMeta',
  'preferences',
];

export async function serializeSelfUser(user) {
  const result = pick(user, selfUserFields);

  [result.banIds, result.unreadDirectsNumber, result.unreadNotificationsNumber, result.statistics] =
    await Promise.all([
      user.getBanIds(),
      user.getUnreadDirectsNumber(),
      user.getUnreadNotificationsNumber(),
      user.getStatistics(),
    ]);

  return result;
}

// This function just selects some props from User/Group object and it is not
// enough to API output.
function pickAccountProps(user) {
  const s = pick(user, user.type === 'user' ? commonUserFields : commonGroupFields);

  if (!user.isActive) {
    s.isGone = true;
  }

  return s;
}

const defaultStats = {
  posts: '0',
  likes: '0',
  comments: '0',
  subscribers: '0',
  subscriptions: '0',
};

/**
 * Serializes users by their ids
 *
 * Keeps userIds order, but adds uniqueness and puts admins (if withAdmins is
 * true) to the end of list.
 *
 * @param {UUID[]} userIds
 * @param {boolean} withAdmins
 * @returns {Promise<Array>}
 */
export async function serializeUsersByIds(userIds, viewerId = null, withAdmins = true) {
  let allUserIds = uniq(userIds);
  const adminsAssoc = await dbAdapter.getGroupsAdministratorsIds(userIds, viewerId);

  if (withAdmins) {
    // Complement allUserIds array by the group admins
    Object.values(adminsAssoc).forEach((ids) => ids.forEach((s) => allUserIds.push(s)));
    allUserIds = uniq(allUserIds);
  }

  // Select users and their stats
  const [usersAssoc, statsAssoc] = await Promise.all([
    dbAdapter.getUsersByIdsAssoc(allUserIds),
    dbAdapter.getUsersStatsAssoc(allUserIds),
  ]);

  // Serialize
  return allUserIds.map((id) => {
    const obj = pickAccountProps(usersAssoc[id]);
    obj.statistics = (!obj.isGone && statsAssoc[id]) || defaultStats;

    if (obj.type === 'group') {
      obj.administrators = adminsAssoc[obj.id] || [];

      // Groups that have no active admins are restricted
      if (!obj.administrators.some((a) => usersAssoc[a]?.isActive)) {
        obj.isRestricted = '1';
      }
    }

    return obj;
  });
}
