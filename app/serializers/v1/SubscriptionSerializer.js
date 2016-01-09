import { Serializer, SubscriberSerializer } from '../../models'


export function addSerializer() {
  return new Serializer('subscriptions', {
    select: ['id', 'user', 'name'],
    user: { through: SubscriberSerializer, embed: true }
  })
}
