/* eslint babel/semi: "error" */
import config from 'config';

import { connect as redisConnection } from './setup/database';
import { connect as postgresConnection } from './setup/postgres';
import { DbAdapter } from './support/DbAdapter';
import { PubSubAdapter } from './support/PubSubAdapter';
import pubSub from './pubsub';
import pubSubStub from './pubsub-stub';
import { addModel as attachmentModel } from './models/attachment';
import { addModel as commentModel } from './models/comment';
import { addModel as groupModel } from './models/group';
import { addModel as postModel } from './models/post';
import { addModel as timelineModel } from './models/timeline';
import { addModel as userModel } from './models/user';
import { addAppTokenV1Model } from './models/auth-tokens';
import { addSerializer as adminSerializer } from './serializers/v1/AdminSerializer';
import { addSerializer as pubsubCommentSerializer } from './serializers/v1/PubsubCommentSerializer';
import { addSerializer as subscriberSerializer } from './serializers/v1/SubscriberSerializer';
import { addSerializer as subscriptionSerializer } from './serializers/v1/SubscriptionSerializer';
import { addSerializer as subscriptionRequestSerializer } from './serializers/v1/SubscriptionRequestSerializer';
import { addSerializer as userSerializer } from './serializers/v1/UserSerializer';
import { addServerInfoModel } from './models/server-info';


// Be careful: order of exports is important.
export const postgres = postgresConnection();
export const dbAdapter = new DbAdapter(postgres);

export { AbstractSerializer } from './serializers/abstract_serializer';
export { Serializer }         from './serializers/serializer';

let _PubSub;

if (config.disableRealtime) {
  _PubSub = new pubSubStub();
} else {
  const database = redisConnection();
  const pubsubAdapter = new PubSubAdapter(database);

  _PubSub = new pubSub(pubsubAdapter);
}

export const PubSub = _PubSub;

export const User          = userModel(dbAdapter);
export const Group         = groupModel(dbAdapter);
export const Post          = postModel(dbAdapter);
export const Timeline      = timelineModel(dbAdapter);
export const Attachment    = attachmentModel(dbAdapter);
export const Comment       = commentModel(dbAdapter);
export { AuthToken, SessionTokenV0 } from './models/auth-tokens';
export const AppTokenV1    = addAppTokenV1Model(dbAdapter);
export const ServerInfo    = addServerInfoModel(dbAdapter);

export const AdminSerializer               = adminSerializer();
export const UserSerializer                = userSerializer();
export const SubscriberSerializer          = subscriberSerializer();
export const SubscriptionSerializer        = subscriptionSerializer();
export const SubscriptionRequestSerializer = subscriptionRequestSerializer();
export const PubsubCommentSerializer       = pubsubCommentSerializer();

export {
  HOMEFEED_MODE_CLASSIC,
  HOMEFEED_MODE_FRIENDS_ALL_ACTIVITY,
  HOMEFEED_MODE_FRIENDS_ONLY
} from './models/timeline';
