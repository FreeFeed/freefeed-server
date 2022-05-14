/* eslint babel/semi: "error" */
import config from 'config';

import { connect as redisConnection } from './setup/database';
import { connect as postgresConnection } from './setup/postgres';
import { DbAdapter } from './support/DbAdapter';
import { PubSubAdapter } from './support/PubSubAdapter';
import pubSub, { DummyPublisher } from './pubsub';
import { SessionTokenV1Store } from './models/auth-tokens';
import { ModelsRegistry } from './models-registry';

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

const registry = new ModelsRegistry(dbAdapter, PubSub);
export const { User, Group, Post, Timeline, Attachment, Comment, ServerInfo, Job, JobManager } =
  registry;

export const sessionTokenV1Store = new SessionTokenV1Store(dbAdapter);

export { AuthToken, AppTokenV1, SessionTokenV1 } from './models/auth-tokens';

export {
  HOMEFEED_MODE_CLASSIC,
  HOMEFEED_MODE_FRIENDS_ALL_ACTIVITY,
  HOMEFEED_MODE_FRIENDS_ONLY,
} from './models/timeline';
