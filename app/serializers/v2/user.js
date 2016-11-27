import { pick } from 'lodash';
import { dbAdapter } from '../../models';

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
  'profilePictureLargeUrl',
  'profilePictureMediumUrl',
];

const selfUserFields = [
  ...commonUserFields,
  'description',
  'email',
  'frontendPreferences',
  'privateMeta',
];

export async function serializeSelfUser(user) {
  const result = pick(user, selfUserFields);

  [
    result.banIds,
    result.pendingGroupRequests,
    result.unreadDirectsNumber,
    result.statistics,
    result.subscribers,
    result.subscriptions,
  ] = await Promise.all([
    user.getBanIds(),
    user.getPendingGroupRequests(),
    user.getUnreadDirectsNumber(),
    user.getStatistics(),
    (async () => {
      const subscribers = await user.getSubscribers();
      return subscribers.map((s) => serializeUser(s));
    })(),
    dbAdapter.getUserSubscriptionsIdsByType(user.id, 'Posts'),
  ]);

  return result;
}

export function serializeUser(user) {
  return pick(user, commonUserFields);
}
