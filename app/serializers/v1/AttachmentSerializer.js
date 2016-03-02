import { Serializer, UserSerializer } from '../../models'


export function addSerializer() {
  return new Serializer('attachments', {
    select: ['id', 'fileName', 'fileSize', 'url', 'thumbnailUrl', 'imageSizes',
             'mediaType', 'createdAt', 'updatedAt', 'createdBy', 'artist', 'title'],
    createdBy: { through: UserSerializer, embed: true }
  })
}
