import { Serializer, AdminSerializer } from '../../models'


export function addSerializer() {
  return new Serializer('admins', {
    select: ['id', 'username', 'type', 'screenName', 'statistics',
      'profilePictureLargeUrl', 'profilePictureMediumUrl',
      'updatedAt', 'isPrivate', 'isProtected',
      'administrators'],
    administrators: { through: AdminSerializer, embed: true }
  })
}
