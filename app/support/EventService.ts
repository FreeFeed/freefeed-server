import _ from 'lodash';

import { User, Group, Post, Comment, PubSub as pubSub, Timeline } from '../models';
import { type ModelsRegistry } from '../models-registry';

import { extractMentions, extractMentionsWithOffsets } from './mentions';
import {
  ALLOWED_EVENT_TYPES,
  COUNTABLE_EVENT_TYPES,
  EVENT_TYPES,
  T_EVENT_TYPE,
} from './EventTypes';
import { Nullable, UUID } from './types';
import { extractUUIDs } from './backlinks';

type OnPostFeedsChangedParams = {
  addedFeeds?: Timeline[];
  removedFeeds?: Timeline[];
};

export class EventService {
  readonly registry: ModelsRegistry;

  constructor(registry: ModelsRegistry) {
    this.registry = registry;
  }

  async onUserBanned(
    initiatorIntId: number,
    bannedUserIntId: number,
    hasRequestedSubscription = false,
  ) {
    await Promise.all([
      this.createEvent(initiatorIntId, EVENT_TYPES.USER_BANNED, initiatorIntId, bannedUserIntId),
      this.createEvent(bannedUserIntId, EVENT_TYPES.BANNED_BY, initiatorIntId, bannedUserIntId),
    ]);

    if (hasRequestedSubscription) {
      await this.onSubscriptionRequestRejected(bannedUserIntId, initiatorIntId);
    }
  }

  async onUserUnbanned(initiatorIntId: number, unbannedUserIntId: number) {
    await Promise.all([
      this.createEvent(
        initiatorIntId,
        EVENT_TYPES.USER_UNBANNED,
        initiatorIntId,
        unbannedUserIntId,
      ),
      this.createEvent(
        unbannedUserIntId,
        EVENT_TYPES.UNBANNED_BY,
        initiatorIntId,
        unbannedUserIntId,
      ),
    ]);
  }

  async onUserSubscribed(initiatorIntId: number, subscribedUserIntId: number) {
    await this.createEvent(
      subscribedUserIntId,
      EVENT_TYPES.USER_SUBSCRIBED,
      initiatorIntId,
      subscribedUserIntId,
    );
  }

  async onUserUnsubscribed(initiatorIntId: number, unsubscribedUserIntId: number) {
    await this.createEvent(
      unsubscribedUserIntId,
      EVENT_TYPES.USER_UNSUBSCRIBED,
      initiatorIntId,
      unsubscribedUserIntId,
    );
  }

  async onSubscriptionRequestCreated(fromUserIntId: number, toUserIntId: number) {
    await this.createEvent(
      toUserIntId,
      EVENT_TYPES.SUBSCRIPTION_REQUESTED,
      fromUserIntId,
      toUserIntId,
    );
  }

  async onSubscriptionRequestRevoked(fromUserIntId: number, toUserIntId: number) {
    await this.createEvent(
      toUserIntId,
      EVENT_TYPES.SUBSCRIPTION_REQUEST_REVOKED,
      fromUserIntId,
      toUserIntId,
    );
  }

  async onSubscriptionRequestApproved(fromUserIntId: number, toUserIntId: number) {
    await this.createEvent(
      fromUserIntId,
      EVENT_TYPES.SUBSCRIPTION_REQUEST_APPROVED,
      toUserIntId,
      fromUserIntId,
    );
  }

  async onSubscriptionRequestRejected(fromUserIntId: number, toUserIntId: number) {
    await this.createEvent(
      fromUserIntId,
      EVENT_TYPES.SUBSCRIPTION_REQUEST_REJECTED,
      toUserIntId,
      fromUserIntId,
    );
  }

  async onGroupCreated(ownerIntId: number, groupIntId: number) {
    await this.createEvent(ownerIntId, EVENT_TYPES.GROUP_CREATED, ownerIntId, null, groupIntId);
  }

  async onGroupSubscribed(initiatorIntId: number, subscribedGroup: Group) {
    await this._notifyGroupAdmins(subscribedGroup, (adminUser: User) =>
      this.createEvent(
        adminUser.intId,
        EVENT_TYPES.GROUP_SUBSCRIBED,
        initiatorIntId,
        null,
        subscribedGroup.intId,
      ),
    );
  }

  async onGroupUnsubscribed(initiatorIntId: number, unsubscribedGroup: Group) {
    await this._notifyGroupAdmins(unsubscribedGroup, (adminUser: User) =>
      this.createEvent(
        adminUser.intId,
        EVENT_TYPES.GROUP_UNSUBSCRIBED,
        initiatorIntId,
        null,
        unsubscribedGroup.intId,
      ),
    );
  }

  async onGroupAdminPromoted(initiatorIntId: number, group: Group, newAdminIntId: number) {
    await this._notifyGroupAdmins(group, async (adminUser: User) => {
      if (adminUser.intId !== newAdminIntId) {
        await this.createEvent(
          adminUser.intId,
          EVENT_TYPES.GROUP_ADMIN_PROMOTED,
          initiatorIntId,
          newAdminIntId,
          group.intId,
        );
      }
    });
  }

  async onGroupAdminDemoted(initiatorIntId: number, group: Group, formerAdminIntId: number) {
    await this._notifyGroupAdmins(group, async (adminUser: User) => {
      if (adminUser.intId !== formerAdminIntId) {
        await this.createEvent(
          adminUser.intId,
          EVENT_TYPES.GROUP_ADMIN_DEMOTED,
          initiatorIntId,
          formerAdminIntId,
          group.intId,
        );
      }
    });
  }

  async onGroupSubscriptionRequestCreated(initiatorIntId: number, group: Group) {
    await this._notifyGroupAdmins(group, (adminUser: User) =>
      this.createEvent(
        adminUser.intId,
        EVENT_TYPES.GROUP_SUBSCRIPTION_REQUEST,
        initiatorIntId,
        initiatorIntId,
        group.intId,
      ),
    );
  }

  async onGroupSubscriptionRequestRevoked(initiatorIntId: number, group: Group) {
    await this._notifyGroupAdmins(group, (adminUser: User) =>
      this.createEvent(
        adminUser.intId,
        EVENT_TYPES.GROUP_REQUEST_REVOKED,
        initiatorIntId,
        initiatorIntId,
        group.intId,
      ),
    );
  }

  async onGroupSubscriptionRequestApproved(
    adminIntId: number,
    group: Group,
    requesterIntId: number,
  ) {
    await this._notifyGroupAdmins(group, (adminUser: User) =>
      this.createEvent(
        adminUser.intId,
        EVENT_TYPES.MANAGED_GROUP_SUBSCRIPTION_APPROVED,
        adminIntId,
        requesterIntId,
        group.intId,
      ),
    );
    await this.createEvent(
      requesterIntId,
      EVENT_TYPES.GROUP_SUBSCRIPTION_APPROVED,
      adminIntId,
      requesterIntId,
      group.intId,
    );
  }

  async onGroupSubscriptionRequestRejected(
    adminIntId: number,
    group: Group,
    requesterIntId: number,
  ) {
    await this._notifyGroupAdmins(group, (adminUser: User) =>
      this.createEvent(
        adminUser.intId,
        EVENT_TYPES.MANAGED_GROUP_SUBSCRIPTION_REJECTED,
        adminIntId,
        requesterIntId,
        group.intId,
      ),
    );
    await this.createEvent(
      requesterIntId,
      EVENT_TYPES.GROUP_SUBSCRIPTION_REJECTED,
      null,
      requesterIntId,
      group.intId,
    );
  }

  async onPostCreated(post: Post, destinationFeedIds: UUID[], author: User) {
    const destinationFeeds = await this.registry.dbAdapter.getTimelinesByIds(destinationFeedIds);
    await this._processDirectMessagesForPost(post, destinationFeeds, author);
    await this._processMentionsInPost(post, destinationFeeds, author);
    await this.processBacklinks(post);
  }

  async onCommentChanged(comment: Comment, wasCreated = false) {
    const [post, mentionEvents] = await Promise.all([
      comment.getPost(),
      this.getMentionEvents(
        comment.body,
        comment.userId,
        EVENT_TYPES.MENTION_IN_COMMENT,
        EVENT_TYPES.MENTION_COMMENT_TO,
      ),
      this.processBacklinks(comment),
    ]);
    const directEvents = wasCreated
      ? await this.getDirectEvents(post, comment.userId, EVENT_TYPES.DIRECT_COMMENT_CREATED)
      : [];

    if (mentionEvents.length === 0 && directEvents.length === 0) {
      return;
    }

    const [postAuthor, commentAuthor, commentAuthorBanners, destFeeds] = await Promise.all([
      this.registry.dbAdapter.getUserById(post.userId),
      comment.userId ? this.registry.dbAdapter.getUserById(comment.userId) : null,
      this.registry.dbAdapter.getUserIdsWhoBannedUser(comment.userId!),
      post.getPostedTo(),
    ]);

    let postGroupIntId: number | null = null;

    if (destFeeds.length === 1) {
      const feedOwner = await destFeeds[0].getUser();

      if (feedOwner.isGroup()) {
        postGroupIntId = feedOwner.intId;
      }
    }

    // Leave users who has post and comment access
    let affectedUsers = _.uniqBy(
      [...mentionEvents, ...directEvents].map(({ user }) => user),
      'id',
    );
    // Only users who can see this post
    affectedUsers = await post.onlyUsersCanSeePost(affectedUsers);
    // Only users who can see this comment
    affectedUsers = affectedUsers.filter((u) => !commentAuthorBanners.includes(u.id));

    // Create events
    await Promise.all(
      [...mentionEvents, ...directEvents]
        .filter(({ user }) => affectedUsers.some((u) => u.id === user.id))
        .map(({ event, user }) =>
          this.createEvent(
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

  async onCommentDestroyed(comment: Comment, destroyedBy: User) {
    if (destroyedBy.id === comment.userId) {
      return;
    }

    const [post, commentAuthor, destroyerGroups] = await Promise.all([
      comment.getPost(),
      comment.userId ? this.registry.dbAdapter.getUserById(comment.userId) : null,
      destroyedBy.getManagedGroups(),
    ]);

    const [postGroupAdmins, postAuthor, postGroups] = await Promise.all([
      this.registry.dbAdapter.getAdminsOfPostGroups(post.id),
      this.registry.dbAdapter.getUserById(post.userId),
      post.getGroupsPostedTo(),
    ]);

    // Message to the comment author
    if (commentAuthor) {
      // Is post belongs to any group managed by destroyer?
      const groups = _.intersectionBy(destroyerGroups, postGroups, 'id');
      await this.createEvent(
        commentAuthor.intId,
        EVENT_TYPES.COMMENT_MODERATED,
        destroyedBy.intId,
        null,
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
        return this.createEvent(
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

  async onPostDestroyed(post: Post, destroyedBy: User, params: { groups?: Group[] } = {}) {
    const { groups: postGroups = [] } = params;

    if (destroyedBy.id === post.userId) {
      return;
    }

    const postAuthor = await this.registry.dbAdapter.getUserById(post.userId);

    // Message to the post author
    await this.createEvent(
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
        return this.createEvent(
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

  async onPostFeedsChanged(post: Post, changedBy: User, params: OnPostFeedsChangedParams = {}) {
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

    const postAuthor = await this.registry.dbAdapter.getUserById(post.userId);

    // Message to the post author
    await this.createEvent(
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
        return this.createEvent(
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

  async onInvitationUsed(fromUserIntId: number, newUserIntId: number) {
    await this.createEvent(fromUserIntId, EVENT_TYPES.INVITATION_USED, newUserIntId, newUserIntId);
  }

  async onDirectLeft(postId: UUID, initiator: User) {
    const post = await this.registry.dbAdapter.getPostById(postId);

    if (!post) {
      return;
    }

    // Posts can have non-unique destinationFeedIds, so we need to _.uniq them
    const postFeeds = await this.registry.dbAdapter.getTimelinesByIntIds(
      _.uniq(post.destinationFeedIds),
    );

    const participantIds = postFeeds.filter((f) => f.isDirects()).map((f) => f.userId);
    const participants = await this.registry.dbAdapter.getUsersByIds(participantIds);
    const postAuthor = participants.find((u) => u.id === post.userId);
    await Promise.all(
      [initiator, ...participants].map((user) =>
        this.createEvent(
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

  ////////////////////////////////////////////

  private async _processDirectMessagesForPost(
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

      const directReceivers = await this.registry.dbAdapter.getUsersByIds(directReceiversIds);
      await Promise.all(
        directReceivers.map((receiver) =>
          this.createEvent(
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

  private async _processMentionsInPost(post: Post, destinationFeeds: Timeline[], author: User) {
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
    const postIsPublic = await this.registry.dbAdapter.someUsersArePublic(
      nonDirectFeedsOwnerIds,
      false,
    );

    const usersBannedByPostAuthor = await author.getBanIds();
    const mentionedUsers = await this.registry.dbAdapter.getFeedOwnersByUsernames(
      mentionedUsernames,
    );

    let usersSubscriptionsStatus = [] as { uid: UUID; is_subscribed: boolean }[];

    if (!postIsPublic) {
      usersSubscriptionsStatus = await this.registry.dbAdapter.areUsersSubscribedToOneOfTimelines(
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

      await this.createEvent(
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

  private async _notifyGroupAdmins(group: Group, adminNotifier: (admin: User) => Promise<any>) {
    const groupAdminsIds = await this.registry.dbAdapter.getGroupAdministratorsIds(group.id);
    const admins = await this.registry.dbAdapter.getUsersByIds(groupAdminsIds);

    const promises = admins.map((adminUser) => {
      return adminNotifier(adminUser);
    });
    await Promise.all(promises);
  }

  async getMentionEvents(
    text: string,
    authorId: Nullable<UUID>,
    eventType: T_EVENT_TYPE,
    firstMentionEventType = eventType,
  ) {
    const mentions = _.uniqBy(extractMentionsWithOffsets(text), 'username');
    const mentionedUsers = (
      await this.registry.dbAdapter.getFeedOwnersByUsernames(mentions.map((u) => u.username))
    )
      // Only users (not groups) and not an event author
      .filter((u) => u.isUser() && u.id !== authorId) as User[];
    return mentions
      .map(({ username, offset }) => ({
        event: offset === 0 ? firstMentionEventType : eventType,
        user: mentionedUsers.find((u) => u.username === username),
      }))
      .filter(({ user }) => !!user) as { user: User; event: T_EVENT_TYPE }[];
  }

  async getDirectEvents(post: Post, authorId: Nullable<UUID>, eventType: T_EVENT_TYPE) {
    const destFeeds = await post.getPostedTo();
    const directFeeds = destFeeds.filter((f) => f.isDirects() && f.userId !== authorId);
    const directReceivers = await this.registry.dbAdapter.getUsersByIds(
      directFeeds.map((f) => f.userId),
    );
    return directReceivers.map((user) => ({ event: eventType, user }));
  }

  async processBacklinks(srcEntity: Post | Comment) {
    const uuids = extractUUIDs(srcEntity.body);
    const [mentionedPosts, mentionedComments] = await Promise.all([
      this.registry.dbAdapter.getPostsByIds(uuids),
      this.registry.dbAdapter.getCommentsByIds(uuids),
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

        await this.createEvent(
          postAuthor.intId,
          srcEntity instanceof Post
            ? EVENT_TYPES.BACKLINK_IN_POST
            : EVENT_TYPES.BACKLINK_IN_COMMENT,
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

        await this.createEvent(
          commentAuthor.intId,
          srcEntity instanceof Post
            ? EVENT_TYPES.BACKLINK_IN_POST
            : EVENT_TYPES.BACKLINK_IN_COMMENT,
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
   */
  async createEvent(
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
    const event = await this.registry.dbAdapter.createEvent(
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
}
