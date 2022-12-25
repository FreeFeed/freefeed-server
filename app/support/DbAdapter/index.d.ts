import Knex, { RawBinding, ValueDict, Transaction } from 'knex';

import { IPAddr, Nullable, UUID } from '../types';
import { AppTokenV1, Attachment, Comment, Group, Post, Timeline, User, Job } from '../../models';
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

type ListAttachmentsOptions = { userId: UUID; limit: number } & (
  | { createdBefore?: string }
  | { createdAfter: string }
  | { offset: number }
);

type AttachmentsSanitizeTask = {
  userId: UUID;
  createdAt: Date;
};

type AttachmentsStats = {
  total: number;
  sanitized: number;
};

export class DbAdapter {
  constructor(connection: Knex);

  database: Knex & CommonDBHelpers & TrxDBHelpers;

  now(): Promise<string>;

  // Subscription requests
  getUserSubscriptionPendingRequestsIds(userId: UUID): Promise<UUID[]>;
  deleteSubscriptionRequest(toUserId: UUID, fromUserId: UUID): Promise<void>;
  getMutualSubscriptionRequestStatuses(
    userId: UUID | null,
    otherUserIds: UUID[],
  ): Promise<Map<UUID, 0 | 1 | 2 | 3>>;

  // External authentication
  getExtProfiles(userId: UUID): Promise<ExtProfileData[]>;
  removeExtProfile(userId: UUID, profileId: UUID): Promise<boolean>;

  // Users
  getUserById(id: UUID): Promise<User | null>;
  getUserByIntId(intId: number): Promise<User | null>;
  getUsersByIds(ids: UUID[]): Promise<User[]>;
  getUserByUsername(username: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  getUsersByNormEmail(email: string): Promise<User[]>;
  existsEmail(email: string): Promise<boolean>;
  existsNormEmail(email: string): Promise<boolean>;
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
  getDirectModesMap(
    userIds: UUID[],
  ): Promise<
    Map<UUID, typeof User.ACCEPT_DIRECTS_FROM_ALL | typeof User.ACCEPT_DIRECTS_FROM_FRIENDS>
  >;

  getUsersIdsByIntIds(intIds: number[]): Promise<{ id: number; uid: UUID }[]>;
  getPostsIdsByIntIds(intIds: number[]): Promise<{ id: number; uid: UUID }[]>;
  getCommentsIdsByIntIds(intIds: number[]): Promise<{ id: number; uid: UUID }[]>;

  // Freeze
  freezeUser(userId: UUID, freezeTime: number | string): Promise<void>;
  userFrozenUntil(userId: UUID): Promise<Date | null>;
  isUserFrozen(userId: UUID): Promise<boolean>;
  cleanFrozenUsers(): Promise<void>;

  // Bans
  getUserBansIds(id: UUID): Promise<UUID[]>;

  // Posts
  getPostById(id: UUID): Promise<Post | null>;
  getAdminsOfPostGroups(postId: UUID): Promise<User[]>;
  getPostsByIds(ids: UUID[]): Promise<Post[]>;
  getPostsByIntIds(ids: number[]): Promise<Post[]>;
  filterSuspendedPosts(ids: UUID[]): Promise<UUID[]>;
  withdrawPostFromDestFeed(feedIntId: number, postUUID: UUID): Promise<boolean>;

  // Likes
  unlikePost(postId: UUID, userId: UUID): Promise<boolean>;

  // Comments
  getCommentById(id: UUID): Promise<Comment | null>;
  getCommentsByIds(ids: UUID[]): Promise<Comment[]>;
  getCommentsByIntIds(ids: number[]): Promise<Comment[]>;
  getCommentBySeqNumber(postId: UUID, seqNumber: number): Promise<Comment | null>;

  // Comment likes
  deleteCommentLike(commentUUID: UUID, likerUUID: UUID): Promise<boolean>;

  // Attachments
  getAttachmentById(id: UUID): Promise<Attachment | null>;
  getPostAttachments(id: UUID): Promise<UUID[]>;
  listAttachments(options: ListAttachmentsOptions): Promise<Attachment[]>;
  createAttachmentsSanitizeTask(userId: UUID): Promise<AttachmentsSanitizeTask>;
  getAttachmentsSanitizeTask(userId: UUID): Promise<Nullable<AttachmentsSanitizeTask>>;
  deleteAttachmentsSanitizeTask(userId: UUID): Promise<void>;
  getNonSanitizedAttachments(userId: UUID, limit: number): Promise<Attachment[]>;
  getAttachmentsStats(userId: UUID): Promise<AttachmentsStats>;

  // Timelines
  getTimelinesByIds(ids: UUID[]): Promise<Timeline[]>;
  getAllUserNamedFeed(userId: UUID, feedName: string): Promise<Timeline[]>;
  getUserNamedFeed(userId: UUID, feedName: string): Promise<Nullable<Timeline>>;
  getTimelinesByIntIds(intIds: number[]): Promise<Timeline[]>;

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
    targetCommentId?: Nullable<UUID>,
  ): Promise<EventRecord>;
  getEventById(eventId: UUID): Promise<Nullable<EventRecord>>;
  getUserEvents(
    userIntId: number,
    eventTypes?: string[],
    limit?: number,
    offset?: number,
    startDate?: Date,
    endDate?: Date,
  ): Promise<EventRecord[]>;

  getUnreadDirectsNumber(userId: UUID): Promise<number>;
  getUnreadEventsNumber(userId: UUID): Promise<number>;

  // Backlinks
  getBacklinksCounts(uuids: UUID[], viewerId?: Nullable<UUID>): Promise<Map<UUID, number>>;
  updateBacklinks(
    text: string,
    refPostUID: UUID,
    refCommentUID?: Nullable<UUID>,
    db?: Knex,
  ): Promise<void>;

  // Jobs
  createJob<T extends {}>(
    name: string,
    payload: T,
    params: { unlockAt?: Date | number; uniqKey?: string },
  ): Promise<Job<T>>;
  updateJob(id: UUID, params: { unlockAt?: Date | number; failure?: boolean | null }): Promise<Job>;
  getJobById(id: UUID): Promise<Nullable<Job>>;
  deleteJob(id: UUID): Promise<void>;
  fetchJobs(count: number, lockTime: number): Promise<Job[]>;
  getAllJobs(names?: string[]): Promise<Job[]>; // For testing purposes only

  // Group blocks
  blockUserInGroup(userId: UUID, groupId: UUID): Promise<boolean>;
  unblockUserInGroup(userId: UUID, groupId: UUID): Promise<boolean>;
  userIdsBlockedInGroup(groupId: UUID): Promise<UUID[]>;
  groupIdsBlockedUser(userId: UUID, fromGroupIds?: UUID[]): Promise<UUID[]>;

  // Subscriptions
  getOnlySubscribedTo(subscriberId: UUID | null, toUserIds: UUID[]): Promise<UUID[]>;
  getMutualSubscriptionStatuses(
    userId: UUID | null,
    otherUserIds: UUID[],
  ): Promise<Map<UUID, 0 | 1 | 2 | 3>>;

  // Email verification
  createEmailVerificationCode(email: string, ipAddress: IPAddr): Promise<string | null>;
  checkEmailVerificationCode(code: string, email: string): Promise<boolean>;
  cleanOldEmailVerificationCodes(): Promise<void>;
}
