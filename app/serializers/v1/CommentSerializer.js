import { Serializer, UserSerializer, User } from '../../models'


export function addSerializer() {
  return new Serializer('comments', {
    select: ['id', 'body', 'createdAt', 'updatedAt', 'userId'],
    userId: { relation: true, model: User, serializeUsing: UserSerializer, customFieldName: 'createdBy' }
  })
}
