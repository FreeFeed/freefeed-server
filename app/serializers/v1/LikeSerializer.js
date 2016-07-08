import { Serializer } from '../../models'


export function addSerializer() {
  return new Serializer('users', { select: ['id', 'username', 'screenName'] })
}
