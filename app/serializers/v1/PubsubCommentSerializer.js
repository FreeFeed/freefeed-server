import { Serializer, UserSerializer } from '../../models'


export function addSerializer() {
  return new Serializer('comments', {
    select:    ['id', 'body', 'createdAt', 'updatedAt', 'createdBy', 'postId'],
    createdBy: { through: UserSerializer, embed: true }
  })
}
