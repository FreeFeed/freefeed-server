import { Serializer } from '../../models'


export function addSerializer() {
  return new Serializer('requests', {
    select: ['id', 'username', 'screenName',
      'profilePictureLargeUrl', 'profilePictureMediumUrl']
  })
}
