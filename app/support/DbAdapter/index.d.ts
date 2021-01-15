import Knex, { RawBinding, ValueDict, Transaction } from 'knex';

import { IPAddr, Nullable, UUID } from '../types';
import { AppTokenV1, Attachment, Comment, Post, User } from '../../models';
import {
  AppTokenCreateParams,
  AppTokenLogPayload,
  AppTokenRecord,
  SessionCreateRecord,
  SessionMutableRecord,
} from '../../models/auth-tokens/types';
import { SessionTokenV1 } from '../../models/auth-tokens';

type QueryBindings = readonly RawBinding[] | ValueDict | RawBinding;

type CommonDBHelpers = {
  getAll<R = any>(sql: string, bindings?: QueryBindings): Promise<R[]>;
  getRow<R = any>(sql: string, bindings?: QueryBindings): Promise<R>;
  getOne<V = any>(sql: string, bindings?: QueryBindings, column?: string | number): Promise<V>;
  getCol<V = any>(sql: string, bindings?: QueryBindings, column?: string | number): Promise<V[]>;
};

type TrxDBHelpers = {
  transaction(): Promise<Transaction & CommonDBHelpers>;
  transaction<T>(action: (trx: Transaction & CommonDBHelpers) => Promise<T>): Promise<T>;
};

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
  getExtProfiles(userId: UUID): Promise<ExtProfileData[]>;
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
  registerAppTokenUsage(
    id: UUID,
    params: { ip: IPAddr; userAgent: string; debounce: string },
  ): Promise<void>;
  logAppTokenRequest(payload: AppTokenLogPayload): Promise<void>;
  periodicInvalidateAppTokens(): Promise<void>;

  // Session tokens
  createAuthSession(params: SessionCreateRecord): Promise<SessionTokenV1>;
  getAuthSessionById(id: UUID): Promise<Nullable<SessionTokenV1>>;
  reissueActiveAuthSession(id: UUID): Promise<Nullable<SessionTokenV1>>;
  updateAuthSession(id: UUID, toUpdate: SessionMutableRecord): Promise<Nullable<SessionTokenV1>>;
  registerAuthSessionUsage(
    uid: UUID,
    params: { ip: IPAddr; userAgent: string; debounceSec: number },
  ): Promise<Nullable<SessionTokenV1>>;
  deleteAuthSession(id: UUID): Promise<boolean>;
  listAuthSessions(userId: UUID): Promise<SessionTokenV1[]>;
  cleanOldAuthSessions(activeTTLDays: number, inactiveTTLDays: number): Promise<void>;
}
