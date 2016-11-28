import { Serializer, AdminSerializer, SubscriptionSerializer, SubscriptionRequestSerializer, SubscriberSerializer } from '../../models'


export function addSerializer() {
  return new Serializer('users', {
    select: ['id', 'username', 'type', 'screenName', 'email', 'statistics',
      'subscriptions', 'profilePictureLargeUrl', 'profilePictureMediumUrl',
      'banIds', 'subscribers', 'isPrivate', 'isProtected', 'isVisibleToAnonymous', 'pendingSubscriptionRequests',
      'subscriptionRequests', 'description', 'frontendPreferences',
      'administrators', 'pendingGroupRequests', 'privateMeta', 'unreadDirectsNumber'],
    subscriptions:               { through: SubscriptionSerializer, embed: true },
    subscribers:                 { through: SubscriberSerializer },
    pendingSubscriptionRequests: { through: SubscriptionRequestSerializer, embed: true },
    subscriptionRequests:        { through: SubscriptionRequestSerializer, embed: true },
    administrators:              { through: AdminSerializer, embed: true }
  })
}
