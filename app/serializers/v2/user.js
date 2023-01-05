import { pick, uniq } from 'lodash';

import { User, dbAdapter } from '../../models';

/**
 * @typedef { import('../../support/types').UUID } UUID
 */

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
  result.youCan = ['post'];
  result.theyDid = [];

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
 * @param {UUID | null} viewerId
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

  const [
    // Select users and their stats
    usersAssoc,
    statsAssoc,
    // Select subscriptions and requests statuses
    subscriptionStatuses,
    subscriptionRequestStatuses,
    // Bans
    viewerBans,
    theyBans,
    groupsWithDisabledBans,
    // Directs
    directModes,
  ] = await Promise.all([
    dbAdapter.getUsersByIdsAssoc(allUserIds),
    dbAdapter.getUsersStatsAssoc(allUserIds),
    dbAdapter.getMutualSubscriptionStatuses(viewerId, allUserIds),
    dbAdapter.getMutualSubscriptionRequestStatuses(viewerId, allUserIds),
    viewerId ? dbAdapter.getUserBansIds(viewerId) : [],
    viewerId ? dbAdapter.getUserIdsWhoBannedUser(viewerId) : [],
    viewerId ? dbAdapter.getGroupsWithDisabledBans(viewerId, allUserIds) : [],
    viewerId ? dbAdapter.getDirectModesMap(allUserIds) : null,
  ]);

  const groupIds = allUserIds.filter((id) => usersAssoc[id]?.type === 'group');
  const blockedInGroups = viewerId ? await dbAdapter.groupIdsBlockedUser(viewerId, groupIds) : [];

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

    obj.youCan = [];
    obj.theyDid = [];

    if (!viewerId) {
      return obj;
    }

    if (obj.id === viewerId) {
      // Viewer themselves
      obj.youCan.push('post');
      return obj;
    }

    const viewerSubscribed = (subscriptionStatuses.get(id) & 1) !== 0;
    const theySubscribed = (subscriptionStatuses.get(id) & 2) !== 0;
    const viewerSentRequest = (subscriptionRequestStatuses.get(id) & 1) !== 0;
    const theySentRequest = (subscriptionRequestStatuses.get(id) & 2) !== 0;

    if (viewerSubscribed) {
      obj.youCan.push('unsubscribe');
    } else if (obj.isPrivate === '1') {
      // Actually we cannot send request if user banned us, but for now we don't
      // want to demonstrate it.
      obj.youCan.push(viewerSentRequest ? 'unrequest_subscription' : 'request_subscription');
    } else {
      obj.youCan.push('subscribe');
    }

    if (theySubscribed) {
      obj.theyDid.push('subscribe');
    } else if (theySentRequest) {
      obj.theyDid.push('request_subscription');
    }

    if (obj.type === 'group') {
      if (blockedInGroups.includes(id)) {
        obj.theyDid.push('block');
      } else if (obj.isRestricted === '1') {
        obj.administrators.includes(viewerId) && obj.youCan.push('post');
      } else if (obj.isPrivate === '0' || viewerSubscribed) {
        obj.youCan.push('post');
      }

      obj.youCan.push(groupsWithDisabledBans.includes(id) ? 'undisable_bans' : 'disable_bans');
    } else {
      // Regular user
      // Bans
      obj.youCan.push(viewerBans.includes(id) ? 'unban' : 'ban');

      // Directs
      if (!obj.isGone && !theyBans.includes(viewerId) && !viewerBans.includes(id)) {
        const mode = directModes.get(id);

        if (
          mode === User.ACCEPT_DIRECTS_FROM_ALL ||
          (mode === User.ACCEPT_DIRECTS_FROM_FRIENDS && theySubscribed)
        ) {
          obj.youCan.push('dm');
        }
      }
    }

    return obj;
  });
}
