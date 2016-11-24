import { Serializer, AdminSerializer } from '../../models'


export function addSerializer() {
  return new Serializer('subscribers', {
    select: ['id', 'username', 'screenName', 'type', 'updatedAt', 'createdAt',
      'isPrivate', 'isProtected', 'isVisibleToAnonymous', 'isRestricted', 'profilePictureLargeUrl', 'profilePictureMediumUrl',
      'administrators'],
    administrators: { through: AdminSerializer, embed: true }
  })
}
