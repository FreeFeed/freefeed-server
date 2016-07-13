import { connect as redisConnection } from '../config/database'
import { connect as postgresConnection } from '../config/postgres'
import { load as configLoader } from '../config/config'

import { DbAdapter } from './support/DbAdapter'
import { PubSubAdapter } from './support/PubSubAdapter'
import pubSub from './pubsub'
import pubSubStub from './pubsub-stub'

import { addModel as attachmentModel } from './models/attachment'
import { addModel as commentModel } from './models/comment'
import { addModel as groupModel } from './models/group'
import { addModel as postModel } from './models/post'
import { addModel as timelineModel } from './models/timeline'
import { addModel as userModel } from './models/user'

import { addSerializer as adminSerializer } from './serializers/v1/AdminSerializer'
import { addSerializer as attachmentSerializer } from './serializers/v1/AttachmentSerializer'
import { addSerializer as commentSerializer } from './serializers/v1/CommentSerializer'
import { addSerializer as groupSerializer } from './serializers/v1/GroupSerializer'
import { addSerializer as likeSerializer } from './serializers/v1/LikeSerializer'
import { addSerializer as myProfileSerializer } from './serializers/v1/MyProfileSerializer'
import { addSerializer as postSerializer } from './serializers/v1/PostSerializer'
import { addSerializer as pubsubCommentSerializer } from './serializers/v1/PubsubCommentSerializer'
import { addSerializer as subscriberSerializer } from './serializers/v1/SubscriberSerializer'
import { addSerializer as subscriptionSerializer } from './serializers/v1/SubscriptionSerializer'
import { addSerializer as subscriptionRequestSerializer } from './serializers/v1/SubscriptionRequestSerializer'
import { addSerializer as timelineSerializer } from './serializers/v1/TimelineSerializer'
import { addSerializer as userSerializer } from './serializers/v1/UserSerializer'


// Be careful: order of exports is important.
export const postgres = postgresConnection()
export const dbAdapter = new DbAdapter(postgres)

export { AbstractSerializer } from './serializers/abstract_serializer'
export { Serializer }         from './serializers/serializer'

const config = configLoader()

export let PubSub;

if (config.disableRealtime) {
  PubSub = new pubSubStub()
} else {
  const database = redisConnection()
  const pubsubAdapter = new PubSubAdapter(database)

  PubSub = new pubSub(pubsubAdapter)
}

export const User          = userModel(dbAdapter)
export const Group         = groupModel(dbAdapter)
export const Post          = postModel(dbAdapter)
export const Timeline      = timelineModel(dbAdapter)
export const Attachment    = attachmentModel(dbAdapter)
export const Comment       = commentModel(dbAdapter)

export const AdminSerializer               = adminSerializer()
export const UserSerializer                = userSerializer()
export const SubscriberSerializer          = subscriberSerializer()
export const SubscriptionSerializer        = subscriptionSerializer()
export const SubscriptionRequestSerializer = subscriptionRequestSerializer()
export const MyProfileSerializer           = myProfileSerializer()
export const LikeSerializer                = likeSerializer()
export const GroupSerializer               = groupSerializer()
export const AttachmentSerializer          = attachmentSerializer()
export const CommentSerializer             = commentSerializer()
export const PubsubCommentSerializer       = pubsubCommentSerializer()
export const PostSerializer                = postSerializer()
export const TimelineSerializer            = timelineSerializer()
