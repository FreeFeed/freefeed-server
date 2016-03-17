import { Serializer, AdminSerializer } from '../../models'


export function addSerializer() {
  return new Serializer('users', {
    select: ['id', 'username', 'type', 'screenName', 'statistics',
             'profilePictureLargeUrl', 'profilePictureMediumUrl',
             'createdAt', 'updatedAt', 'isPrivate', 'isRestricted', 'description',
             'administrators'],
    administrators: { through: AdminSerializer, embed: true }
  })
}
