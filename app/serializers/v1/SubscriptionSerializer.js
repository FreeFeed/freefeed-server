import { Serializer, SubscriberSerializer, User } from '../../models'


export function addSerializer() {
  return new Serializer('subscriptions', {
    select: ['id', 'userId', 'name'],
    userId: { relation: true, model: User, serializeUsing: SubscriberSerializer, customFieldName: 'user' }
  })
}
