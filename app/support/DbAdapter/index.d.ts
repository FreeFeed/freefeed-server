import Knex, { RawBinding, ValueDict, Transaction } from 'knex';

import { IPAddr, Nullable, UUID } from '../types';
import { AppTokenV1, Attachment, Comment, Post, User } from '../../models';
import { AppTokenCreateParams, AppTokenLogPayload, AppTokenRecord } from '../../models/auth-tokens/types';


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
  createAppToken(token: AppTokenCreateParams): Promise<AppTokenV1>;
  getAppTokenById(id: UUID): Promise<Nullable<AppTokenV1>>;
  getActiveAppTokenByIdAndIssue(id: UUID, issue: number): Promise<Nullable<AppTokenV1>>;
  getAppTokenByActivationCode(code: string, codeTTL: number): Promise<Nullable<AppTokenV1>>;
  listActiveAppTokens(userId: UUID): Promise<AppTokenV1[]>;
  updateAppToken(id: UUID, toUpdate: Partial<AppTokenRecord>): Promise<AppTokenV1>;
  reissueAppToken(id: UUID): Promise<AppTokenV1>;
  deleteAppToken(id: UUID): Promise<void>;
  registerAppTokenUsage(id: UUID, params: { ip: IPAddr, userAgent: string, debounce: string }): Promise<void>;
  logAppTokenRequest(payload: AppTokenLogPayload): Promise<void>;
  periodicInvalidateAppTokens(): Promise<void>;
}
