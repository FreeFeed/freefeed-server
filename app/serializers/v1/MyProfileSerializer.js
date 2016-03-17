import { Serializer, AdminSerializer, SubscriptionSerializer, SubscriptionRequestSerializer, SubscriberSerializer } from '../../models'


export function addSerializer() {
  return new Serializer('users', {
    select: ['id', 'username', 'type', 'screenName', 'email', 'statistics',
             'subscriptions', 'profilePictureLargeUrl', 'profilePictureMediumUrl',
             'banIds', 'subscribers', 'isPrivate', 'pendingSubscriptionRequests',
             'subscriptionRequests', 'description', 'frontendPreferences',
             'administrators', 'pendingGroupRequests'],
    subscriptions: { through: SubscriptionSerializer, embed: true },
    subscribers: { through: SubscriberSerializer },
    pendingSubscriptionRequests: { through: SubscriptionRequestSerializer, embed: true },
    subscriptionRequests: { through: SubscriptionRequestSerializer, embed: true },
    administrators: { through: AdminSerializer, embed: true }
  })
}
