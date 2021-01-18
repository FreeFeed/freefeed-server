import Knex from 'knex';

import { DbAdapter } from './support/DbAdapter';
import PubSubAdapter from './pubsub';
import { GONE_NAMES } from './models/user';
import { Nullable, UUID } from './support/types';
import { SessionTokenV1Store } from './models/auth-tokens';

export const postgres: Knex;
export const dbAdapter: DbAdapter;
export const PubSub: PubSubAdapter;

export class User {
  id: UUID;
  intId: number;
  username: string;
  readonly isActive: boolean;
  type: 'user';
  setGoneStatus(status: keyof typeof GONE_NAMES): Promise<void>;
  unban(usernames: string): Promise<1>;
  unsubscribeFrom(targetUser: User): Promise<boolean>;
  getHomeFeeds(): Promise<Timeline[]>;
  getSubscriptionsWithHomeFeeds(): Promise<{ user_id: UUID; homefeed_ids: UUID[] }[]>;
  isGroup(): false;
  isUser(): true;
  getManagedGroups(): Promise<Group[]>;
  getBanIds(): Promise<UUID[]>;
}

export class Group {
  id: UUID;
  intId: number;
  username: string;
  type: 'group';
  isGroup(): true;
  isUser(): false;
  getAdministrators(): Promise<User[]>;
}

export class Post {
  id: UUID;
  userId: UUID;
  body: string;
  destroy(destroyedBy?: User): Promise<void>;
  removeLike(user: User): Promise<boolean>;
  getPostedTo(): Promise<Timeline[]>;
  onlyUsersCanSeePost(fromUsers: User[]): Promise<User[]>;
  getGroupsPostedTo(): Promise<Group[]>;
  getCreatedBy(): Promise<User>;
}

export class Timeline {
  id: UUID;
  userId: UUID;
  getUser(): Promise<User | Group>;
  destroy(): Promise<void>;
  isDirects(): boolean;
  isPosts(): boolean;
}

export class Attachment {
  destroy(destroyedBy?: User): Promise<void>;
}

export class Comment {
  id: UUID;
  body: string;
  userId: Nullable<UUID>;
  hideType: 0 | 1 | 2 | 3;
  postId: UUID;
  getPost(): Promise<Post>;
  removeLike(user: User): Promise<boolean>;
}

export const sessionTokenV1Store: SessionTokenV1Store;

export { AuthToken, SessionTokenV0, AppTokenV1, SessionTokenV1 } from './models/auth-tokens';

export class ServerInfo {}

export class Job {}

export class JobManager {}

export {
  HOMEFEED_MODE_CLASSIC,
  HOMEFEED_MODE_FRIENDS_ALL_ACTIVITY,
  HOMEFEED_MODE_FRIENDS_ONLY,
} from './models/timeline';
