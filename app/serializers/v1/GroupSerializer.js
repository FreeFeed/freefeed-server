import { Serializer, AdminSerializer, SubscriptionSerializer } from '../../models'


export function addSerializer() {
  return new Serializer('groups', {
    select: ['id', 'username', 'type', 'screenName',
             'profilePictureLargeUrl', 'profilePictureMediumUrl',
             'updatedAt', 'isPrivate', 'isRestricted', 'description',
             'timelines', 'administrators'],
    timelines: { through: SubscriptionSerializer, embed: true },
    administrators: { through: AdminSerializer, embed: true }
  })
}
