import _, { difference, uniqBy } from 'lodash';

import { dbAdapter, User, Group, Post, Comment, PubSub as pubSub, Timeline } from '../models';

import { extractMentions, extractMentionsWithOffsets } from './mentions';
import {
  ALLOWED_EVENT_TYPES,
  COUNTABLE_EVENT_TYPES,
  EVENT_TYPES,
  T_EVENT_TYPE,
} from './EventTypes';
import { Nullable, UUID } from './types';
import { extractHashedShortIds, extractShortIds, extractUUIDs } from './backlinks';

type OnPostFeedsChangedParams = {
  addedFeeds?: Timeline[];
  removedFeeds?: Timeline[];
};

type EventData = { userId: UUID; event: T_EVENT_TYPE };

export class EventService {
  static async onUserBanned(
    initiatorIntId: number,
    bannedUserIntId: number,
    hasRequestedSubscription = false,
  ) {
    await Promise.all([
      createEvent(initiatorIntId, EVENT_TYPES.USER_BANNED, initiatorIntId, bannedUserIntId),
      createEvent(bannedUserIntId, EVENT_TYPES.BANNED_BY, initiatorIntId, bannedUserIntId),
    ]);

    if (hasRequestedSubscription) {
      await this.onSubscriptionRequestRejected(bannedUserIntId, initiatorIntId);
    }
  }

  static async onUserUnbanned(initiatorIntId: number, unbannedUserIntId: number) {
    await Promise.all([
      createEvent(initiatorIntId, EVENT_TYPES.USER_UNBANNED, initiatorIntId, unbannedUserIntId),
      createEvent(unbannedUserIntId, EVENT_TYPES.UNBANNED_BY, initiatorIntId, unbannedUserIntId),
    ]);
  }

  static async onUserSubscribed(initiatorIntId: number, subscribedUserIntId: number) {
    await createEvent(
      subscribedUserIntId,
      EVENT_TYPES.USER_SUBSCRIBED,
      initiatorIntId,
      subscribedUserIntId,
    );
  }

  static async onUserUnsubscribed(initiatorIntId: number, unsubscribedUserIntId: number) {
    await createEvent(
      unsubscribedUserIntId,
      EVENT_TYPES.USER_UNSUBSCRIBED,
      initiatorIntId,
      unsubscribedUserIntId,
    );
  }

  static async onSubscriptionRequestCreated(fromUserIntId: number, toUserIntId: number) {
    await createEvent(toUserIntId, EVENT_TYPES.SUBSCRIPTION_REQUESTED, fromUserIntId, toUserIntId);
  }

  static async onSubscriptionRequestRevoked(fromUserIntId: number, toUserIntId: number) {
    await createEvent(
      toUserIntId,
      EVENT_TYPES.SUBSCRIPTION_REQUEST_REVOKED,
      fromUserIntId,
      toUserIntId,
    );
  }

  static async onSubscriptionRequestApproved(fromUserIntId: number, toUserIntId: number) {
    await createEvent(
      fromUserIntId,
      EVENT_TYPES.SUBSCRIPTION_REQUEST_APPROVED,
      toUserIntId,
      fromUserIntId,
    );
  }

  static async onSubscriptionRequestRejected(fromUserIntId: number, toUserIntId: number) {
    await createEvent(
      fromUserIntId,
      EVENT_TYPES.SUBSCRIPTION_REQUEST_REJECTED,
      toUserIntId,
      fromUserIntId,
    );
  }

  static async onGroupCreated(ownerIntId: number, groupIntId: number) {
    await createEvent(ownerIntId, EVENT_TYPES.GROUP_CREATED, ownerIntId, null, groupIntId);
  }

  static async onGroupSubscribed(initiatorIntId: number, subscribedGroup: Group) {
    await this._notifyGroupAdmins(subscribedGroup, (adminUser: User) =>
      createEvent(
        adminUser.intId,
        EVENT_TYPES.GROUP_SUBSCRIBED,
        initiatorIntId,
        null,
        subscribedGroup.intId,
      ),
    );
  }

  static async onGroupUnsubscribed(initiatorIntId: number, unsubscribedGroup: Group) {
    await this._notifyGroupAdmins(unsubscribedGroup, (adminUser: User) =>
      createEvent(
        adminUser.intId,
        EVENT_TYPES.GROUP_UNSUBSCRIBED,
        initiatorIntId,
        null,
        unsubscribedGroup.intId,
      ),
    );
  }

  static async onGroupAdminPromoted(initiatorIntId: number, group: Group, newAdminIntId: number) {
    await this._notifyGroupAdmins(group, async (adminUser: User) => {
      if (adminUser.intId !== newAdminIntId) {
        await createEvent(
          adminUser.intId,
          EVENT_TYPES.GROUP_ADMIN_PROMOTED,
          initiatorIntId,
          newAdminIntId,
          group.intId,
        );
      }
    });
  }

  static async onGroupAdminDemoted(initiatorIntId: number, group: Group, formerAdminIntId: number) {
    await this._notifyGroupAdmins(group, async (adminUser: User) => {
      if (adminUser.intId !== formerAdminIntId) {
        await createEvent(
          adminUser.intId,
          EVENT_TYPES.GROUP_ADMIN_DEMOTED,
          initiatorIntId,
          formerAdminIntId,
          group.intId,
        );
      }
    });
  }

  static async onGroupSubscriptionRequestCreated(initiatorIntId: number, group: Group) {
    await this._notifyGroupAdmins(group, (adminUser: User) =>
      createEvent(
        adminUser.intId,
        EVENT_TYPES.GROUP_SUBSCRIPTION_REQUEST,
        initiatorIntId,
        initiatorIntId,
        group.intId,
      ),
    );
  }

  static async onGroupSubscriptionRequestRevoked(initiatorIntId: number, group: Group) {
    await this._notifyGroupAdmins(group, (adminUser: User) =>
      createEvent(
        adminUser.intId,
        EVENT_TYPES.GROUP_REQUEST_REVOKED,
        initiatorIntId,
        initiatorIntId,
        group.intId,
      ),
    );
  }

  static async onGroupSubscriptionRequestApproved(
    adminIntId: number,
    group: Group,
    requesterIntId: number,
  ) {
    await this._notifyGroupAdmins(group, (adminUser: User) =>
      createEvent(
        adminUser.intId,
        EVENT_TYPES.MANAGED_GROUP_SUBSCRIPTION_APPROVED,
        adminIntId,
        requesterIntId,
        group.intId,
      ),
    );
    await createEvent(
      requesterIntId,
      EVENT_TYPES.GROUP_SUBSCRIPTION_APPROVED,
      adminIntId,
      requesterIntId,
      group.intId,
    );
  }

  static async onGroupSubscriptionRequestRejected(
    adminIntId: number,
    group: Group,
    requesterIntId: number,
  ) {
    await this._notifyGroupAdmins(group, (adminUser: User) =>
      createEvent(
        adminUser.intId,
        EVENT_TYPES.MANAGED_GROUP_SUBSCRIPTION_REJECTED,
        adminIntId,
        requesterIntId,
        group.intId,
      ),
    );
    await createEvent(
      requesterIntId,
      EVENT_TYPES.GROUP_SUBSCRIPTION_REJECTED,
      null,
      requesterIntId,
      group.intId,
    );
  }

  static async onPostCreated(
    post: Post,
    destinationFeedIds: UUID[],
    author: User,
    { prevBody = '' } = {},
  ) {
    const destinationFeeds = await dbAdapter.getTimelinesByIds(destinationFeedIds);
    await this._processDirectMessagesForPost(post, destinationFeeds, author);
    await this._processMentionsInPost(post, destinationFeeds, author);
    await processBacklinks(post, prevBody);
  }

  static async onPostCommentsListened(user: User, post: Post, enabled: boolean) {
    const [postAuthor, destFeeds] = await Promise.all([post.getCreatedBy(), post.getPostedTo()]);
    let groupIntId: number | null = null;

    if (destFeeds.length === 1) {
      const feedOwner = await destFeeds[0].getUser();

      if (feedOwner.isGroup()) {
        groupIntId = feedOwner.intId;
      }
    }

    await createEvent(
      user.intId,
      enabled ? EVENT_TYPES.POST_COMMENTS_SUBSCRIBE : EVENT_TYPES.POST_COMMENTS_UNSUBSCRIBE,
      user.intId,
      user.intId,
      groupIntId,
      post.id,
      null,
      postAuthor.intId,
    );
  }

  static async onCommentChanged(comment: Comment, wasCreated = false, { prevBody = '' } = {}) {
    const post = await comment.getPost();

    const [
      mentionEvents,
      postCommentEvents,
      directEvents,
      // skip result
    ] = await Promise.all([
      getMentionInCommentEvents(comment.body),
      wasCreated ? getPostCommentEvents(post) : [],
      wasCreated ? getDirectCommentEvents(post) : [],
      processBacklinks(comment, prevBody),
    ]);

    const eventsToSend = uniqBy(
      // Order these event types by priority. If there is a 'mention' for the some
      // user, then the other types for the same user should not be sent.
      [...mentionEvents, ...directEvents, ...postCommentEvents],
      'userId',
    )
      // Comment author should not be notified
      .filter((e) => e.userId !== comment.userId);

    if (eventsToSend.length === 0) {
      return;
    }

    const [postAuthor, commentAuthor, commentAuthorBanners, destFeeds, affectedUsers] =
      await Promise.all([
        dbAdapter.getUserById(post.userId),
        comment.userId ? dbAdapter.getUserById(comment.userId) : null,
        dbAdapter.getUserIdsWhoBannedUser(comment.userId!),
        post.getPostedTo(),
        dbAdapter.getFeedOwnersByIds(eventsToSend.map((e) => e.userId)) as Promise<User[]>,
      ]);

    let postGroupIntId: number | null = null;

    if (destFeeds.length === 1) {
      const feedOwner = await destFeeds[0].getUser();

      if (feedOwner.isGroup()) {
        postGroupIntId = feedOwner.intId;
      }
    }

    // Leave users who has post and comment access
    // Only users who can see this post
    let targetUsers = await post.onlyUsersCanSeePost(affectedUsers);
    // Only users who can see this comment
    targetUsers = targetUsers.filter((u) => !commentAuthorBanners.includes(u.id));

    // Create events
    await Promise.all(
      (
        eventsToSend
          .map((e) => ({ event: e.event, user: targetUsers.find((u) => u.id === e.userId) }))
          .filter((e) => e.user) as { event: T_EVENT_TYPE; user: User }[]
      ).map(({ event, user }) =>
        createEvent(
          user.intId,
          event,
          commentAuthor!.intId,
          user.intId,
          postGroupIntId,
          post.id,
          comment.id,
          postAuthor!.intId,
        ),
      ),
    );
  }

  static async onCommentDestroyed(comment: Comment, destroyedBy: User) {
    if (destroyedBy.id === comment.userId) {
      return;
    }

    const [post, commentAuthor, destroyerGroups] = await Promise.all([
      comment.getPost(),
      comment.userId ? dbAdapter.getUserById(comment.userId) : null,
      destroyedBy.getManagedGroups(),
    ]);

    const [postGroupAdmins, postAuthor, postGroups] = await Promise.all([
      dbAdapter.getAdminsOfPostGroups(post.id),
      dbAdapter.getUserById(post.userId),
      post.getGroupsPostedTo(),
    ]);

    // Message to the comment author
    if (commentAuthor) {
      // Is post belongs to any group managed by destroyer?
      const groups = _.intersectionBy(destroyerGroups, postGroups, 'id');
      await createEvent(
        commentAuthor.intId,
        EVENT_TYPES.COMMENT_MODERATED,
        destroyedBy.intId,
        commentAuthor.intId,
        groups.length === 0 ? null : groups[0].intId,
        post.id,
        null,
        postAuthor!.intId,
      );
    }

    if (post.userId === destroyedBy.id || postGroups.length === 0) {
      return;
    }

    // Messages to other groups admins (but not to comment author and not to destroyer)
    const otherAdmins = postGroupAdmins.filter(
      (a) => a.id !== destroyedBy.id && a.id !== comment.userId,
    );

    await Promise.all(
      otherAdmins.map(async (a) => {
        const managedGroups = await a.getManagedGroups();
        const groups = _.intersectionBy(managedGroups, postGroups, 'id');
        return createEvent(
          a.intId,
          EVENT_TYPES.COMMENT_MODERATED_BY_ANOTHER_ADMIN,
          destroyedBy.intId,
          commentAuthor?.intId,
          groups[0].intId,
          post.id,
          null,
          postAuthor!.intId,
        );
      }),
    );
  }

  static async onPostDestroyed(post: Post, destroyedBy: User, params: { groups?: Group[] } = {}) {
    const { groups: postGroups = [] } = params;

    if (destroyedBy.id === post.userId) {
      return;
    }

    const postAuthor = await dbAdapter.getUserById(post.userId);

    // Message to the post author
    await createEvent(
      postAuthor!.intId,
      EVENT_TYPES.POST_MODERATED,
      destroyedBy.intId,
      postAuthor!.intId,
      postGroups.length === 0 ? null : postGroups[0].intId,
      null,
      null,
      null,
    );

    if (postGroups.length === 0) {
      return;
    }

    const groupAdminLists = await Promise.all(postGroups.map((g) => g.getAdministrators()));
    const groupAdmins = _.uniqBy(_.flatten(groupAdminLists), 'id');

    // Messages to other groups admins (but not to post author and not to destroyer)
    const otherAdmins = groupAdmins.filter((a) => a.id !== destroyedBy.id && a.id !== post.userId);

    await Promise.all(
      otherAdmins.map(async (a) => {
        const managedGroups = await a.getManagedGroups();
        const groups = _.intersectionBy(managedGroups, postGroups, 'id');
        return createEvent(
          a.intId,
          EVENT_TYPES.POST_MODERATED_BY_ANOTHER_ADMIN,
          destroyedBy.intId,
          postAuthor!.intId,
          groups[0].intId,
          null,
          null,
          null,
        );
      }),
    );
  }

  static async onPostFeedsChanged(
    post: Post,
    changedBy: User,
    params: OnPostFeedsChangedParams = {},
  ) {
    const { addedFeeds = [], removedFeeds = [] } = params;

    if (addedFeeds.length > 0) {
      const postAuthor = await post.getCreatedBy();
      await this._processDirectMessagesForPost(post, addedFeeds, postAuthor);
    }

    if (changedBy.id === post.userId || removedFeeds.length === 0) {
      return;
    }

    const removedFeedOwners = await Promise.all(
      removedFeeds.filter((f) => f.isPosts()).map((f) => f.getUser()),
    );
    const removedFromGroups = removedFeedOwners.filter((o) => o.isGroup()) as Group[];

    const postAuthor = await dbAdapter.getUserById(post.userId);

    // Message to the post author
    await createEvent(
      postAuthor!.intId,
      EVENT_TYPES.POST_MODERATED,
      changedBy.intId,
      postAuthor!.intId,
      removedFromGroups.length === 0 ? null : removedFromGroups[0].intId,
      post.id,
      null,
      null,
    );

    if (post.userId === changedBy.id || removedFromGroups.length === 0) {
      return;
    }

    const groupAdminLists = await Promise.all(removedFromGroups.map((g) => g.getAdministrators()));
    const groupAdmins = _.uniqBy(_.flatten(groupAdminLists), 'id');

    // Messages to other groups admins (but not to post author and not to destroyer)
    const otherAdmins = groupAdmins.filter((a) => a.id !== changedBy.id && a.id !== post.userId);

    await Promise.all(
      otherAdmins.map(async (a) => {
        const managedGroups = await a.getManagedGroups();
        const groups = _.intersectionBy(managedGroups, removedFromGroups, 'id');
        return createEvent(
          a.intId,
          EVENT_TYPES.POST_MODERATED_BY_ANOTHER_ADMIN,
          changedBy.intId,
          postAuthor!.intId,
          groups[0].intId,
          post.id,
          null,
          postAuthor!.intId,
        );
      }),
    );
  }

  static async onInvitationUsed(fromUserIntId: number, newUserIntId: number) {
    await createEvent(fromUserIntId, EVENT_TYPES.INVITATION_USED, newUserIntId, newUserIntId);
  }

  static async onDirectLeft(postId: UUID, initiator: User) {
    const post = await dbAdapter.getPostById(postId);

    if (!post) {
      return;
    }

    // Posts can have non-unique destinationFeedIds, so we need to _.uniq them
    const postFeeds = await dbAdapter.getTimelinesByIntIds(_.uniq(post.destinationFeedIds));

    const participantIds = postFeeds.filter((f) => f.isDirects()).map((f) => f.userId);
    const participants = await dbAdapter.getUsersByIds(participantIds);
    const postAuthor = participants.find((u) => u.id === post.userId);
    await Promise.all(
      [initiator, ...participants].map((user) =>
        createEvent(
          user.intId,
          EVENT_TYPES.DIRECT_LEFT,
          initiator.intId,
          initiator.intId,
          null, // Directs haven't groups?
          postId,
          null,
          postAuthor?.intId || null,
        ),
      ),
    );
  }

  static async onBlockedInGroup(group: Group, userId: UUID, adminId: UUID) {
    const [user, admin] = await dbAdapter.getFeedOwnersByIds([userId, adminId]);

    if (!user || !admin) {
      return;
    }

    const participants = uniqBy([user, ...(await group.getActiveAdministrators())], 'id');

    await Promise.all(
      participants.map((p) =>
        createEvent(p.intId, EVENT_TYPES.BLOCKED_IN_GROUP, admin.intId, user.intId, group.intId),
      ),
    );
  }

  static async onUnblockedInGroup(group: Group, userId: UUID, adminId: UUID) {
    const [user, admin] = await dbAdapter.getFeedOwnersByIds([userId, adminId]);

    if (!user || !admin) {
      return;
    }

    const participants = uniqBy([user, ...(await group.getActiveAdministrators())], 'id');

    await Promise.all(
      participants.map((p) =>
        createEvent(p.intId, EVENT_TYPES.UNBLOCKED_IN_GROUP, admin.intId, user.intId, group.intId),
      ),
    );
  }

  static async onBansInGroupDisabled(group: Group, userId: UUID, initiatorId: UUID = userId) {
    const [user, initiator] = await dbAdapter.getFeedOwnersByIds([userId, initiatorId]);

    if (!user || !initiator) {
      return;
    }

    await createEvent(
      user.intId,
      EVENT_TYPES.BANS_IN_GROUP_DISABLED,
      initiator.intId,
      user.intId,
      group.intId,
    );
  }

  static async onBansInGroupEnabled(group: Group, userId: UUID, initiatorId: UUID) {
    const [user, initiator] = await dbAdapter.getFeedOwnersByIds([userId, initiatorId]);

    if (!user || !initiator) {
      return;
    }

    await createEvent(
      user.intId,
      EVENT_TYPES.BANS_IN_GROUP_ENABLED,
      initiator.intId,
      user.intId,
      group.intId,
    );
  }

  ////////////////////////////////////////////

  static async _processDirectMessagesForPost(
    post: Post,
    destinationFeeds: Timeline[],
    author: User,
  ) {
    const directFeeds = destinationFeeds.filter((f) => {
      return f.isDirects() && f.userId !== author.id;
    });

    if (directFeeds.length > 0) {
      const directReceiversIds = directFeeds.map((f) => {
        return f.userId;
      });

      const directReceivers = await dbAdapter.getUsersByIds(directReceiversIds);
      await Promise.all(
        directReceivers.map((receiver) =>
          createEvent(
            receiver.intId,
            EVENT_TYPES.DIRECT_CREATED,
            author.intId,
            receiver.intId,
            null,
            post.id,
            null,
            author.intId,
          ),
        ),
      );
    }
  }

  static async _processMentionsInPost(post: Post, destinationFeeds: Timeline[], author: User) {
    const mentionedUsernames = _.uniq(extractMentions(post.body));

    if (mentionedUsernames.length === 0) {
      return;
    }

    let postGroupIntId: Nullable<number> = null;

    if (destinationFeeds.length === 1) {
      const [postFeed] = destinationFeeds;
      const feedOwner = await postFeed.getUser();

      if (feedOwner.type === 'group') {
        postGroupIntId = feedOwner.intId;
      }
    }

    const postDestinationsFeedsOwners = destinationFeeds.map((f) => f.userId);
    const nonDirectFeeds = destinationFeeds.filter((f) => !f.isDirects());
    const nonDirectFeedsIds = nonDirectFeeds.map((f) => f.id);
    const nonDirectFeedsOwnerIds = nonDirectFeeds.map((f) => f.userId);
    const postIsPublic = await dbAdapter.someUsersArePublic(nonDirectFeedsOwnerIds, false);

    const usersBannedByPostAuthor = await author.getBanIds();
    const mentionedUsers = await dbAdapter.getFeedOwnersByUsernames(mentionedUsernames);

    let usersSubscriptionsStatus = [] as { uid: UUID; is_subscribed: boolean }[];

    if (!postIsPublic) {
      usersSubscriptionsStatus = await dbAdapter.areUsersSubscribedToOneOfTimelines(
        mentionedUsers.map((u) => u.id),
        nonDirectFeedsIds,
      );
    }

    const promises = mentionedUsers.map(async (user) => {
      if (!user || user.type !== 'user') {
        return;
      }

      if (author.id === user.id) {
        return;
      }

      if (usersBannedByPostAuthor.includes(user.id)) {
        return;
      }

      const usersBannedByCurrentUser = await user.getBanIds();

      if (usersBannedByCurrentUser.includes(author.id)) {
        return;
      }

      if (!postDestinationsFeedsOwners.includes(user.id)) {
        if (nonDirectFeeds.length === 0) {
          return;
        }

        if (!postIsPublic) {
          const subscriptionStatus = usersSubscriptionsStatus.find((u) => u.uid === user.id);

          if (!subscriptionStatus?.is_subscribed) {
            return;
          }
        }
      }

      await createEvent(
        user.intId,
        EVENT_TYPES.MENTION_IN_POST,
        author.intId,
        user.intId,
        postGroupIntId,
        post.id,
        null,
        author.intId,
      );
    });
    await Promise.all(promises);
  }

  static async _notifyGroupAdmins(group: Group, adminNotifier: (admin: User) => Promise<any>) {
    const groupAdminsIds = await dbAdapter.getGroupAdministratorsIds(group.id);
    const admins = await dbAdapter.getUsersByIds(groupAdminsIds);

    const promises = admins.map((adminUser) => {
      return adminNotifier(adminUser);
    });
    await Promise.all(promises);
  }
}

async function getPostCommentEvents(post: Post) {
  const userIds = await post.getCommentsListeners();
  return userIds.map((userId) => ({ event: EVENT_TYPES.POST_COMMENT, userId }));
}

async function getMentionInCommentEvents(text: string): Promise<EventData[]> {
  const mentions = _.uniqBy(extractMentionsWithOffsets(text), 'username');
  const mentionedUsers = (await dbAdapter.getFeedOwnersByUsernames(mentions.map((u) => u.username)))
    // Only users (not groups)
    .filter((u) => u.isUser()) as User[];
  return mentions
    .map(({ username, offset }) => ({
      event: offset === 0 ? EVENT_TYPES.MENTION_COMMENT_TO : EVENT_TYPES.MENTION_IN_COMMENT,
      userId: mentionedUsers.find((u) => u.username === username)?.id,
    }))
    .filter((e) => e.userId) as EventData[];
}

async function getDirectCommentEvents(post: Post): Promise<EventData[]> {
  const [destFeeds, listenersMap] = await Promise.all([
    post.getPostedTo(),
    dbAdapter.getCommentEventsListenersForPost(post.id),
  ]);
  return (
    destFeeds
      .filter((f) => f.isDirects())
      .map((f) => ({ event: EVENT_TYPES.DIRECT_COMMENT_CREATED, userId: f.userId }))
      // Don't count recipients who are explicitly unsubscribed
      .filter((e) => listenersMap.get(e.userId) !== false)
  );
}

async function processBacklinks(srcEntity: Post | Comment, prevBody = '') {
  // Long links with UUIDs, both post and post+comment
  const prevUUIDs = extractUUIDs(prevBody);
  const newUUIDs = extractUUIDs(srcEntity.body);
  const uuids = difference(newUUIDs, prevUUIDs);

  // Short post links (e.g. `/user/5168a0`)
  const postShortIds = difference(extractShortIds(srcEntity.body), extractShortIds(prevBody));
  const morePostUUIDs = await dbAdapter.getPostLongIds(postShortIds);
  uuids.push(...morePostUUIDs);

  // Short comment links (e.g. `/user/9bac13#ad2b`)
  const commentShortIds = difference(
    extractHashedShortIds(srcEntity.body),
    extractHashedShortIds(prevBody),
  );
  const moreCommentUUIDs = await dbAdapter.getCommentLongIds(commentShortIds);
  uuids.push(...moreCommentUUIDs);

  const [mentionedPosts, mentionedComments] = await Promise.all([
    dbAdapter.getPostsByIds(uuids),
    dbAdapter.getCommentsByIds(uuids),
  ]);

  if (mentionedPosts.length === 0 && mentionedComments.length === 0) {
    return;
  }

  const [srcViewers, initiator] = await Promise.all([
    srcEntity.usersCanSee(),
    srcEntity.getCreatedBy(),
  ]);

  const srcPost = srcEntity instanceof Post ? srcEntity : await srcEntity.getPost();
  const [srcPostAuthor, srcPostGroups] = await Promise.all([
    srcPost.getCreatedBy(),
    srcPost.getGroupsPostedTo(),
  ]);

  await Promise.all([
    ...mentionedPosts.map(async (post) => {
      if (srcEntity.userId === post.userId || !srcViewers.includes(post.userId)) {
        return;
      }

      const postAuthor = await post.getCreatedBy();

      await createEvent(
        postAuthor.intId,
        srcEntity instanceof Post ? EVENT_TYPES.BACKLINK_IN_POST : EVENT_TYPES.BACKLINK_IN_COMMENT,
        initiator.intId,
        postAuthor.intId,
        srcPostGroups[0]?.intId,
        srcPost.id,
        srcEntity instanceof Comment ? srcEntity.id : null,
        srcPostAuthor.intId,
        post.id,
      );
    }),
    ...mentionedComments.map(async (comment) => {
      if (
        !comment.userId ||
        srcEntity.userId === comment.userId ||
        !srcViewers.includes(comment.userId)
      ) {
        return;
      }

      const [commentAuthor, commentPost] = await Promise.all([
        comment.getCreatedBy(),
        comment.getPost(),
      ]);

      await createEvent(
        commentAuthor.intId,
        srcEntity instanceof Post ? EVENT_TYPES.BACKLINK_IN_POST : EVENT_TYPES.BACKLINK_IN_COMMENT,
        initiator.intId,
        commentAuthor.intId,
        srcPostGroups[0]?.intId,
        srcPost.id,
        srcEntity instanceof Comment ? srcEntity.id : null,
        srcPostAuthor.intId,
        commentPost.id,
        comment.id,
      );
    }),
  ]);
}

/**
 * Create event and perform necessary actions after create
 *
 * @param recipientIntId
 * @param eventType
 * @param createdByUserIntId
 * @param targetUserIntId
 * @param groupIntId
 * @param postId
 * @param commentId
 * @param postAuthorIntId
 */
async function createEvent(
  recipientIntId: number,
  eventType: T_EVENT_TYPE,
  createdByUserIntId: Nullable<number>,
  targetUserIntId: Nullable<number> = null,
  groupIntId: Nullable<number> = null,
  postId: Nullable<UUID> = null,
  commentId: Nullable<UUID> = null,
  postAuthorIntId: Nullable<number> = null,
  targetPostId: Nullable<UUID> = null,
  targetCommentId: Nullable<UUID> = null,
) {
  // Somebody else's action over the post: we should check, is the post visible
  // for the recipient.
  if (postId !== null && createdByUserIntId !== recipientIntId) {
    const [recipient, post] = await Promise.all([
      dbAdapter.getUserByIntId(recipientIntId),
      dbAdapter.getPostById(postId),
    ]);
    const visible = post ? await post.isVisibleFor(recipient) : false;

    if (!visible) {
      return null;
    }
  }

  const event = await dbAdapter.createEvent(
    recipientIntId,
    eventType,
    createdByUserIntId,
    targetUserIntId,
    groupIntId,
    postId,
    commentId,
    postAuthorIntId,
    targetPostId,
    targetCommentId,
  );

  // It is possible if event is conflicting with existing by unique key
  if (!event) {
    return null;
  }

  const updates = [];

  if (ALLOWED_EVENT_TYPES.includes(eventType)) {
    updates.push(pubSub.newEvent(event.uid));
  }

  if (COUNTABLE_EVENT_TYPES.includes(eventType)) {
    if (recipientIntId !== createdByUserIntId) {
      updates.push(pubSub.updateUnreadNotifications(recipientIntId));

      if (eventType === EVENT_TYPES.SUBSCRIPTION_REQUEST_APPROVED) {
        updates.push(pubSub.updateUnreadNotifications(createdByUserIntId!));
      }
    }
  }

  await Promise.all(updates);

  return event;
}
