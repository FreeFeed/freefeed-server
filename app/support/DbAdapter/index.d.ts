import Knex, { RawBinding, ValueDict, Transaction } from 'knex';

import { UUID } from '../types';
import { AppTokenV1, Attachment, Comment, Post, User } from '../../models';


type QueryBindings = readonly RawBinding[] | ValueDict | RawBinding;

type CommonDBHelpers = {
  getAll<R = any>(sql: string, bindings?: QueryBindings): Promise<R[]>;
  getRow<R = any>(sql: string, bindings?: QueryBindings): Promise<R>;
  getOne<V = any>(sql: string, bindings?: QueryBindings, column?: string | number): Promise<V>;
  getCol<V = any>(sql: string, bindings?: QueryBindings, column?: string | number): Promise<V[]>;
}

type TrxDBHelpers = {
  transaction(): Promise<Transaction & CommonDBHelpers>;
  transaction<T>(action: (trx: Transaction & CommonDBHelpers) => Promise<T>): Promise<T>;
}

type ExtProfileData = {
  id: UUID;
  userId: UUID;
  provider: string;
  externalId: string;
  title: string;
  createdAt: string;
};

export class DbAdapter {
  constructor(connection: Knex);

  database: Knex & CommonDBHelpers & TrxDBHelpers;

  // Subscription requests
  getUserSubscriptionPendingRequestsIds(userId: UUID): Promise<UUID[]>;
  deleteSubscriptionRequest(toUserId: UUID, fromUserId: UUID): Promise<void>;

  // External authentication
  getExtProfiles(userId: UUID): Promise<ExtProfileData[]>
  removeExtProfile(userId: UUID, profileId: UUID): Promise<boolean>;

  // Users
  getUserById(id: UUID): Promise<User | null>;

  // Posts
  getPostById(id: UUID): Promise<Post | null>;

  // Comments
  getCommentById(id: UUID): Promise<Comment | null>;

  // Attachments
  getAttachmentById(id: UUID): Promise<Attachment | null>;

  // App tokens
  getAppTokenById(id: UUID): Promise<AppTokenV1 | null>;
}
