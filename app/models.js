/* eslint babel/semi: "error" */
import config from 'config';

import { connect as redisConnection } from './setup/database';
import { connect as postgresConnection } from './setup/postgres';
import { DbAdapter } from './support/DbAdapter';
import { PubSubAdapter } from './support/PubSubAdapter';
import pubSub, { DummyPublisher } from './pubsub';
import { addModel as attachmentModel } from './models/attachment';
import { addModel as commentModel } from './models/comment';
import { addModel as groupModel } from './models/group';
import { addModel as postModel } from './models/post';
import { addModel as timelineModel } from './models/timeline';
import { addModel as userModel } from './models/user';
import { addServerInfoModel } from './models/server-info';
import { addJobModel, addJobManagerModel } from './models/job';
import { SessionTokenV1Store } from './models/auth-tokens';

// Be careful: order of exports is important.
export const postgres = postgresConnection();
export const dbAdapter = new DbAdapter(postgres);

let pubsubAdapter;

if (config.disableRealtime) {
  pubsubAdapter = new DummyPublisher();
} else {
  pubsubAdapter = new PubSubAdapter(redisConnection());
}

export const PubSub = new pubSub(pubsubAdapter);

export const User = userModel(dbAdapter);
export const Group = groupModel(dbAdapter);
export const Post = postModel(dbAdapter);
export const Timeline = timelineModel(dbAdapter);
export const Attachment = attachmentModel(dbAdapter);
export const Comment = commentModel(dbAdapter);
export const ServerInfo = addServerInfoModel(dbAdapter);
export const Job = addJobModel(dbAdapter);
export const JobManager = addJobManagerModel(dbAdapter);

export const sessionTokenV1Store = new SessionTokenV1Store(dbAdapter);

export { AuthToken, AppTokenV1, SessionTokenV1 } from './models/auth-tokens';

export {
  HOMEFEED_MODE_CLASSIC,
  HOMEFEED_MODE_FRIENDS_ALL_ACTIVITY,
  HOMEFEED_MODE_FRIENDS_ONLY,
} from './models/timeline';
