import { Serializer } from '../../models'


export function addSerializer() {
  return new Serializer("subscribers", {
    select: ['id', 'username', 'screenName', 'type', 'updatedAt', 'createdAt',
             'isPrivate', 'isRestricted', 'profilePictureLargeUrl', 'profilePictureMediumUrl']
  })
}
