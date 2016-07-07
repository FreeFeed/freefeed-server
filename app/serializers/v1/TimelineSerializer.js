import { Serializer, SubscriberSerializer, PostSerializer, UserSerializer } from '../../models'


export function addSerializer() {
  return new Serializer('timelines', {
    select:      ['name', 'id', 'posts', 'user', 'subscribers'],
    posts:       { through: PostSerializer, embed: true },
    user:        { through: UserSerializer, embed: true },
    subscribers: { through: SubscriberSerializer, embed: true }
  })
}
