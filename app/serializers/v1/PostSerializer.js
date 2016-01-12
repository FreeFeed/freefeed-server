import { Serializer, AttachmentSerializer, CommentSerializer, SubscriptionSerializer, UserSerializer} from '../../models'


export function addSerializer() {
  return new Serializer("posts", {
    select: ['id', 'body', 'attachments', 'createdBy', 'comments', 'createdAt', 'updatedAt', 'updatedAt', 'likes', 'isHidden', 'omittedComments', 'omittedLikes', 'postedTo', 'commentsDisabled'],
    attachments: { through: AttachmentSerializer, embed: true },
    createdBy: { through: UserSerializer, embed: true },
    comments: { through: CommentSerializer, embed: true },
    likes: { through: UserSerializer, embed: true },
    postedTo: { through: SubscriptionSerializer, embed: true }
  })
}
