import { Serializer, UserSerializer, User } from '../../models'


export function addSerializer() {
  return new Serializer('attachments', {
    select: ['id', 'fileName', 'fileSize', 'url', 'thumbnailUrl', 'imageSizes',
      'mediaType', 'createdAt', 'updatedAt', 'userId', 'artist', 'title'],
    userId: { relation: true, model: User, serializeUsing: UserSerializer, customFieldName: 'createdBy' }
  })
}
