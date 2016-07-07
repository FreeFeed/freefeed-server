import { Serializer, AttachmentSerializer, CommentSerializer, SubscriptionSerializer, UserSerializer, User } from '../../models'


export function addSerializer() {
  return new Serializer('posts', {
    select:      ['id', 'body', 'attachments', 'userId', 'comments', 'createdAt', 'updatedAt', 'likeIds', 'isHidden', 'omittedComments', 'omittedLikes', 'postedTo', 'commentsDisabled'],
    attachments: { through: AttachmentSerializer, embed: true },
    userId:      { relation: true, model: User, serializeUsing: UserSerializer, customFieldName: 'createdBy' },
    comments:    { through: CommentSerializer, embed: true },
    likeIds:     { relation: true, model: User, serializeUsing: UserSerializer, customFieldName: 'likes' },
    postedTo:    { through: SubscriptionSerializer, embed: true }
  })
}
