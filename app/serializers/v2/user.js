import { pick } from 'lodash';

const commonUserFields = [
  'id',
  'username',
  'screenName',
  'isPrivate',
  'isProtected',
  'isVisibleToAnonymous',
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
  return pick(user, user.type === 'group' ? commonGroupFields : commonUserFields);
}
