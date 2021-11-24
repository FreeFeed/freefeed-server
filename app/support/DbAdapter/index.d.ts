import Knex, { RawBinding, ValueDict, Transaction } from 'knex';

import { IPAddr, Nullable, UUID } from '../types';
import { AppTokenV1, Attachment, Comment, Group, Post, Timeline, User } from '../../models';
import {
  AppTokenCreateParams,
  AppTokenLogPayload,
  AppTokenRecord,
  SessionCreateRecord,
  SessionMutableRecord,
} from '../../models/auth-tokens/types';
import { SessionTokenV1 } from '../../models/auth-tokens';
import { T_EVENT_TYPE } from '../EventTypes';

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

export type EventRecord = {
  id: number;
  uid: UUID;
  created_at: Date;
  user_id: number;
  event_type: T_EVENT_TYPE;
  created_by_user_id: Nullable<number>;
  target_user_id: Nullable<number>;
  group_id: Nullable<number>;
  post_id: Nullable<number>;
  comment_id: Nullable<number>;
  post_author_id: Nullable<number>;
  target_post_id: Nullable<UUID>;
  target_comment_id: Nullable<UUID>;
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
  getUsersByIds(ids: UUID[]): Promise<User[]>;
  getUserByUsername(username: string): Promise<User | null>;
  getUserIdsWhoBannedUser(id: UUID): Promise<UUID[]>;
  getFeedOwnerById(id: UUID): Promise<User | Group | null>;
  getFeedOwnersByUsernames(names: string[]): Promise<(User | Group)[]>;
  getFeedOwnersByIds(ids: UUID[]): Promise<Nullable<User | Group>[]>;
  someUsersArePublic(userIds: UUID[], anonymousFriendly: boolean): Promise<boolean>;
  areUsersSubscribedToOneOfTimelines(
    userIds: UUID[],
    timelineIds: UUID[],
  ): Promise<{ uid: UUID; is_subscribed: boolean }[]>;
  getTimelineSubscribersIds(timelineId: UUID): Promise<UUID[]>;
  getGroupAdministratorsIds(id: UUID): Promise<UUID[]>;
  getGroupsAdministratorsIds(
    groupIds: UUID[],
    viewerId?: Nullable<UUID>,
  ): Promise<{ [k: string]: UUID[] }>;
  getUsersByIdsAssoc(ids: UUID[]): Promise<{ [k: string]: User | Group }>;
  getUsersStatsAssoc(ids: UUID[]): Promise<{
    [k: string]: {
      posts: number;
      likes: number;
      comments: number;
      subscribers: number;
      subscriptions: number;
    };
  }>;
  isUserAdminOfGroup(userId: UUID, groupId: UUID): Promise<boolean>;

  getUsersIdsByIntIds(intIds: number[]): Promise<{ id: number; uid: UUID }[]>;
  getPostsIdsByIntIds(intIds: number[]): Promise<{ id: number; uid: UUID }[]>;
  getCommentsIdsByIntIds(intIds: number[]): Promise<{ id: number; uid: UUID }[]>;

  // Bans
  getUserBansIds(id: UUID): Promise<UUID[]>;

  // Posts
  getPostById(id: UUID): Promise<Post | null>;
  getAdminsOfPostGroups(postId: UUID): Promise<User[]>;
  getPostsByIds(ids: UUID[]): Promise<Post[]>;
  getPostsByIntIds(ids: number[]): Promise<Post[]>;
  filterSuspendedPosts(ids: UUID[]): Promise<UUID[]>;
  withdrawPostFromDestFeed(feedIntId: number, postUUID: UUID): Promise<boolean>;

  // Comments
  getCommentById(id: UUID): Promise<Comment | null>;
  getCommentsByIds(ids: UUID[]): Promise<Comment[]>;
  getCommentsByIntIds(ids: number[]): Promise<Comment[]>;
  getCommentBySeqNumber(postId: UUID, seqNumber: number): Promise<Comment | null>;

  // Attachments
  getAttachmentById(id: UUID): Promise<Attachment | null>;

  // Timelines
  getTimelinesByIds(ids: UUID[]): Promise<Timeline[]>;
  getAllUserNamedFeed(userId: UUID, feedName: string): Promise<Timeline[]>;
  getUserNamedFeed(userId: UUID, feedName: string): Promise<Nullable<Timeline>>;

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

  createEvent(
    recipientIntId: number,
    eventType: T_EVENT_TYPE,
    createdByUserIntId: Nullable<number>,
    targetUserIntId?: Nullable<number>,
    groupIntId?: Nullable<number>,
    postId?: Nullable<UUID>,
    commentId?: Nullable<UUID>,
    postAuthorIntId?: Nullable<number>,
    targetPostId?: Nullable<UUID>,
    targetCommntId?: Nullable<UUID>,
  ): Promise<EventRecord>;
  getEventById(eventId: UUID): Promise<Nullable<EventRecord>>;

  getUnreadDirectsNumber(userId: UUID): Promise<number>;
  getUnreadEventsNumber(userId: UUID): Promise<number>;

  // Backlinks
  getBacklinksCounts(uuids: UUID[], viewerId?: Nullable<UUID>): Promise<Map<UUID, number>>;
}
