import { Serializer, SubscriptionSerializer, SubscriptionRequestSerializer, SubscriberSerializer } from '../../models'


export function addSerializer() {
  return new Serializer('users', {
    select: ['id', 'username', 'type', 'screenName', 'email',
      'subscriptions', 'profilePictureLargeUrl', 'profilePictureMediumUrl',
      'banIds', 'subscribers', 'isPrivate', 'isVisibleToAnonymous', 'pendingSubscriptionRequests',
      'subscriptionRequests', 'description', 'frontendPreferences',
      'pendingGroupRequests', 'privateMeta', 'unreadDirectsNumber'],
    subscriptions:               { through: SubscriptionSerializer, embed: true },
    subscribers:                 { through: SubscriberSerializer },
    pendingSubscriptionRequests: { through: SubscriptionRequestSerializer, embed: true },
    subscriptionRequests:        { through: SubscriptionRequestSerializer, embed: true }
  })
}
