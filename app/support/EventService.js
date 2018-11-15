import _ from 'lodash'
import { dbAdapter, PubSub as pubSub } from '../models'
import { extractMentions, extractMentionsWithIndices } from './mentions'
import { EVENT_TYPES } from './EventTypes';


export class EventService {
  static async onUserBanned(initiatorIntId, bannedUserIntId, hasRequestedSubscription = false) {
    await dbAdapter.createEvent(initiatorIntId, EVENT_TYPES.USER_BANNED, initiatorIntId, bannedUserIntId);
    await dbAdapter.createEvent(bannedUserIntId, EVENT_TYPES.BANNED_BY, initiatorIntId, bannedUserIntId);

    if (hasRequestedSubscription) {
      await this.onSubscriptionRequestRejected(bannedUserIntId, initiatorIntId);
    }
  }

  static async onUserUnbanned(initiatorIntId, unbannedUserIntId) {
    await dbAdapter.createEvent(initiatorIntId, EVENT_TYPES.USER_UNBANNED, initiatorIntId, unbannedUserIntId);
    await dbAdapter.createEvent(unbannedUserIntId, EVENT_TYPES.UNBANNED_BY, initiatorIntId, unbannedUserIntId);
  }

  static async onUserSubscribed(initiatorIntId, subscribedUserIntId) {
    await dbAdapter.createEvent(subscribedUserIntId, EVENT_TYPES.USER_SUBSCRIBED, initiatorIntId, subscribedUserIntId);
    await pubSub.updateUnreadNotifications(subscribedUserIntId);
  }

  static async onUserUnsubscribed(initiatorIntId, unsubscribedUserIntId) {
    await dbAdapter.createEvent(unsubscribedUserIntId, EVENT_TYPES.USER_UNSUBSCRIBED, initiatorIntId, unsubscribedUserIntId);
  }

  static async onSubscriptionRequestCreated(fromUserIntId, toUserIntId) {
    await dbAdapter.createEvent(toUserIntId, EVENT_TYPES.SUBSCRIPTION_REQUESTED, fromUserIntId, toUserIntId);
    await pubSub.updateUnreadNotifications(toUserIntId);
  }

  static async onSubscriptionRequestRevoked(fromUserIntId, toUserIntId) {
    await dbAdapter.createEvent(toUserIntId, EVENT_TYPES.SUBSCRIPTION_REQUEST_REVOKED, fromUserIntId, toUserIntId);
    await pubSub.updateUnreadNotifications(toUserIntId);
  }

  static async onSubscriptionRequestApproved(fromUserIntId, toUserIntId) {
    await dbAdapter.createEvent(fromUserIntId, EVENT_TYPES.SUBSCRIPTION_REQUEST_APPROVED, toUserIntId, fromUserIntId);
    await pubSub.updateUnreadNotifications(fromUserIntId);
    await pubSub.updateUnreadNotifications(toUserIntId);
  }

  static async onSubscriptionRequestRejected(fromUserIntId, toUserIntId) {
    await dbAdapter.createEvent(fromUserIntId, EVENT_TYPES.SUBSCRIPTION_REQUEST_REJECTED, toUserIntId, fromUserIntId);
    await pubSub.updateUnreadNotifications(fromUserIntId);
  }

  static async onGroupCreated(ownerIntId, groupIntId) {
    await dbAdapter.createEvent(ownerIntId, EVENT_TYPES.GROUP_CREATED, ownerIntId, null, groupIntId);
  }

  static async onGroupSubscribed(initiatorIntId, subscribedGroup) {
    await this._notifyGroupAdmins(subscribedGroup, async (adminUser) => {
      await dbAdapter.createEvent(adminUser.intId, EVENT_TYPES.GROUP_SUBSCRIBED, initiatorIntId, null, subscribedGroup.intId);
      return pubSub.updateUnreadNotifications(adminUser.intId);
    });
  }

  static async onGroupUnsubscribed(initiatorIntId, unsubscribedGroup) {
    await this._notifyGroupAdmins(unsubscribedGroup, async (adminUser) => {
      await dbAdapter.createEvent(adminUser.intId, EVENT_TYPES.GROUP_UNSUBSCRIBED, initiatorIntId, null, unsubscribedGroup.intId);
      return pubSub.updateUnreadNotifications(adminUser.intId);
    });
  }

  static async onGroupAdminPromoted(initiatorIntId, group, newAdminIntId) {
    await this._notifyGroupAdmins(group, async (adminUser) => {
      if (adminUser.intId === newAdminIntId) {
        return null;
      }

      await dbAdapter.createEvent(adminUser.intId, EVENT_TYPES.GROUP_ADMIN_PROMOTED, initiatorIntId, newAdminIntId, group.intId);

      if (adminUser.intId !== initiatorIntId) {
        await pubSub.updateUnreadNotifications(adminUser.intId);
      }

      return null;
    });
  }

  static async onGroupAdminDemoted(initiatorIntId, group, formerAdminIntId) {
    await this._notifyGroupAdmins(group, async (adminUser) => {
      if (adminUser.intId === formerAdminIntId) {
        return null;
      }

      await dbAdapter.createEvent(adminUser.intId, EVENT_TYPES.GROUP_ADMIN_DEMOTED, initiatorIntId, formerAdminIntId, group.intId);

      if (adminUser.intId !== initiatorIntId) {
        await pubSub.updateUnreadNotifications(adminUser.intId);
      }

      return null;
    });
  }

  static async onGroupSubscriptionRequestCreated(initiatorIntId, group) {
    await this._notifyGroupAdmins(group, async (adminUser) => {
      await dbAdapter.createEvent(adminUser.intId, EVENT_TYPES.GROUP_SUBSCRIPTION_REQUEST, initiatorIntId, initiatorIntId, group.intId);
      return pubSub.updateUnreadNotifications(adminUser.intId);
    });
  }

  static async onGroupSubscriptionRequestRevoked(initiatorIntId, group) {
    await this._notifyGroupAdmins(group, async (adminUser) => {
      await dbAdapter.createEvent(adminUser.intId, EVENT_TYPES.GROUP_REQUEST_REVOKED, initiatorIntId, initiatorIntId, group.intId);
      return pubSub.updateUnreadNotifications(adminUser.intId);
    });
  }

  static async onGroupSubscriptionRequestApproved(adminIntId, group, requesterIntId) {
    await this._notifyGroupAdmins(group, async (adminUser) => {
      await dbAdapter.createEvent(adminUser.intId, EVENT_TYPES.MANAGED_GROUP_SUBSCRIPTION_APPROVED, adminIntId, requesterIntId, group.intId);

      if (adminUser.intId !== adminIntId) {
        await pubSub.updateUnreadNotifications(adminUser.intId);
      }
    });
    await dbAdapter.createEvent(requesterIntId, EVENT_TYPES.GROUP_SUBSCRIPTION_APPROVED, adminIntId, requesterIntId, group.intId);
    return pubSub.updateUnreadNotifications(requesterIntId);
  }

  static async onGroupSubscriptionRequestRejected(adminIntId, group, requesterIntId) {
    await this._notifyGroupAdmins(group, async (adminUser) => {
      await dbAdapter.createEvent(adminUser.intId, EVENT_TYPES.MANAGED_GROUP_SUBSCRIPTION_REJECTED, adminIntId, requesterIntId, group.intId);

      if (adminUser.intId !== adminIntId) {
        await pubSub.updateUnreadNotifications(adminUser.intId);
      }
    });
    await dbAdapter.createEvent(requesterIntId, EVENT_TYPES.GROUP_SUBSCRIPTION_REJECTED, null, requesterIntId, group.intId);
    return pubSub.updateUnreadNotifications(requesterIntId);
  }

  static async onPostCreated(post, destinationFeedIds, author) {
    const destinationFeeds = await dbAdapter.getTimelinesByIds(destinationFeedIds);
    await this._processDirectMessagesForPost(post, destinationFeeds, author);
    await this._processMentionsInPost(post, destinationFeeds, author);
  }

  static async onCommentChanged(comment, wasCreated = false) {
    const [
      post,
      mentionEvents,
    ] = await Promise.all([
      comment.getPost(),
      getMentionEvents(comment.body, comment.userId, EVENT_TYPES.MENTION_IN_COMMENT, EVENT_TYPES.MENTION_COMMENT_TO),
    ]);
    const directEvents = wasCreated ? await getDirectEvents(post, comment.userId, EVENT_TYPES.DIRECT_COMMENT_CREATED) : [];

    if (mentionEvents.length === 0 && directEvents.length === 0) {
      return;
    }

    const [
      postAuthor,
      commentAuthor,
      commentAuthorBanners,
      destFeeds,
    ] = await Promise.all([
      dbAdapter.getUserById(post.userId),
      dbAdapter.getUserById(comment.userId),
      dbAdapter.getUserIdsWhoBannedUser(comment.userId),
      post.getPostedTo(),
    ]);

    let postGroupIntId = null;

    if (destFeeds.length === 1) {
      const feedOwner = await destFeeds[0].getUser();

      if (feedOwner.isGroup()) {
        postGroupIntId = feedOwner.intId;
      }
    }

    // Leave users who has post and comment access
    let affectedUsers = _.uniqBy([...mentionEvents, ...directEvents].map(({ user }) => user), 'id');
    // Only users who can see this post
    affectedUsers = await post.onlyUsersCanSeePost(affectedUsers);
    // Only users who can see this comment
    affectedUsers = affectedUsers.filter((u) => !commentAuthorBanners.includes(u.id));

    // Create events
    await Promise.all([...mentionEvents, ...directEvents]
      .filter(({ user }) => affectedUsers.some((u) => u.id === user.id))
      .map(({ event, user }) => dbAdapter.createEvent(
        user.intId,
        event,
        commentAuthor.intId,
        user.intId,
        postGroupIntId,
        post.id,
        comment.id,
        postAuthor.intId,
      )));

    // Update unread notifications counters
    await Promise.all(affectedUsers.map((u) => pubSub.updateUnreadNotifications(u.intId)));
  }

  static async onCommentDestroyed(comment, destroyedBy) {
    if (destroyedBy.id === comment.userId) {
      return;
    }

    const [
      post,
      commentAuthor,
      destroyerGroups,
    ] = await Promise.all([
      comment.getPost(),
      dbAdapter.getUserById(comment.userId),
      destroyedBy.getManagedGroups(),
    ]);

    const [
      postGroupAdmins,
      postAuthor,
      postGroups,
    ] = await Promise.all([
      dbAdapter.getAdminsOfPostGroups(post.id),
      dbAdapter.getUserById(post.userId),
      post.getGroupsPostedTo(),
    ]);

    // Message to the comment author
    {
      // Is post belongs to any group managed by destroyer?
      const groups = _.intersectionBy(destroyerGroups, postGroups, 'id');
      await dbAdapter.createEvent(
        commentAuthor.intId,
        EVENT_TYPES.COMMENT_MODERATED,
        destroyedBy.intId,
        null,
        groups.length === 0 ? null : groups[0].intId,
        post.id,
        null,
        postAuthor.intId,
      );
    }

    if (post.userId === destroyedBy.id || postGroups.length === 0) {
      return;
    }

    // Messages to other groups admins (but not to comment author and not to destroyer)
    const otherAdmins = postGroupAdmins.filter((a) => a.id !== destroyedBy.id && a.id !== comment.userId);

    await Promise.all(otherAdmins.map(async (a) => {
      const managedGroups = await a.getManagedGroups();
      const groups = _.intersectionBy(managedGroups, postGroups, 'id');
      await dbAdapter.createEvent(
        a.intId,
        EVENT_TYPES.COMMENT_MODERATED_BY_ANOTHER_ADMIN,
        destroyedBy.intId,
        commentAuthor.intId,
        groups[0].intId,
        post.id,
        null,
        postAuthor.intId,
      );
    }));
  }

  static async onPostDestroyed(post, destroyedBy, params = {}) {
    const { groups: postGroups = [] } = params;

    if (destroyedBy.id === post.userId) {
      return;
    }

    const postAuthor = await dbAdapter.getUserById(post.userId);

    // Message to the post author
    await dbAdapter.createEvent(
      postAuthor.intId,
      EVENT_TYPES.POST_MODERATED,
      destroyedBy.intId,
      postAuthor.intId,
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

    await Promise.all(otherAdmins.map(async (a) => {
      const managedGroups = await a.getManagedGroups();
      const groups = _.intersectionBy(managedGroups, postGroups, 'id');
      await dbAdapter.createEvent(
        a.intId,
        EVENT_TYPES.POST_MODERATED_BY_ANOTHER_ADMIN,
        destroyedBy.intId,
        postAuthor.intId,
        groups[0].intId,
        null,
        null,
        null,
      );
    }));
  }

  static async onPostFeedsChanged(post, changedBy, params = {}) {
    const { addedFeeds = [], removedFeeds = [] } = params;

    if (addedFeeds.length > 0) {
      const postAuthor = await post.getCreatedBy();
      await this._processDirectMessagesForPost(post, addedFeeds, postAuthor);
    }

    if (changedBy.id === post.userId || removedFeeds.length === 0) {
      return;
    }

    const removedFeedOwners = await Promise.all(
      removedFeeds
        .filter((f) => f.isPosts())
        .map((f) => f.getUser())
    );
    const removedFromGroups = removedFeedOwners.filter((o) => o.isGroup());

    const postAuthor = await dbAdapter.getUserById(post.userId);

    // Message to the post author
    await dbAdapter.createEvent(
      postAuthor.intId,
      EVENT_TYPES.POST_MODERATED,
      changedBy.intId,
      postAuthor.intId,
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

    await Promise.all(otherAdmins.map(async (a) => {
      const managedGroups = await a.getManagedGroups();
      const groups = _.intersectionBy(managedGroups, removedFromGroups, 'id');
      await dbAdapter.createEvent(
        a.intId,
        EVENT_TYPES.POST_MODERATED_BY_ANOTHER_ADMIN,
        changedBy.intId,
        postAuthor.intId,
        groups[0].intId,
        post.id,
        null,
        postAuthor.intId,
      );
    }));
  }

  static async onInvitationUsed(fromUserIntId, newUserIntId) {
    await dbAdapter.createEvent(fromUserIntId, EVENT_TYPES.INVITATION_USED, newUserIntId, newUserIntId);
    await pubSub.updateUnreadNotifications(fromUserIntId);
  }

  ////////////////////////////////////////////

  static async _processDirectMessagesForPost(post, destinationFeeds, author) {
    const directFeeds = destinationFeeds.filter((f) => {
      return f.isDirects() && f.userId !== author.id;
    });

    if (directFeeds.length > 0) {
      const directReceiversIds = directFeeds.map((f) => {
        return f.userId;
      });

      const directReceivers = await dbAdapter.getUsersByIds(directReceiversIds);
      const promises = directReceivers.map(async (receiver) => {
        await dbAdapter.createEvent(receiver.intId, EVENT_TYPES.DIRECT_CREATED, author.intId, receiver.intId, null, post.id, null, author.intId);
        return pubSub.updateUnreadNotifications(receiver.intId);
      });
      await Promise.all(promises);
    }
  }

  static async _processMentionsInPost(post, destinationFeeds, author) {
    const mentionedUsernames = _.uniq(extractMentions(post.body));

    if (mentionedUsernames.length === 0) {
      return;
    }

    let postGroupIntId = null;

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

    let usersSubscriptionsStatus = [];

    if (!postIsPublic) {
      usersSubscriptionsStatus = await dbAdapter.areUsersSubscribedToOneOfTimelines(mentionedUsers.map((u) => u.id), nonDirectFeedsIds);
    }

    const promises = mentionedUsers.map(async (user) => {
      if (!user || user.type !== 'user') {
        return null;
      }

      if (author.id === user.id) {
        return null;
      }

      if (usersBannedByPostAuthor.includes(user.id)) {
        return null;
      }

      const usersBannedByCurrentUser = await user.getBanIds();

      if (usersBannedByCurrentUser.includes(author.id)) {
        return null;
      }

      if (!postDestinationsFeedsOwners.includes(user.id)) {
        if (nonDirectFeeds.length === 0) {
          return null;
        }

        if (!postIsPublic) {
          const subscriptionStatus = usersSubscriptionsStatus.find((u) => u.uid === user.id);

          if (!subscriptionStatus.is_subscribed) {
            return null;
          }
        }
      }

      await dbAdapter.createEvent(user.intId, EVENT_TYPES.MENTION_IN_POST, author.intId, user.intId, postGroupIntId, post.id, null, author.intId);
      return pubSub.updateUnreadNotifications(user.intId);
    });
    await Promise.all(promises);
  }

  static async _notifyGroupAdmins(group, adminNotifier) {
    const groupAdminsIds = await dbAdapter.getGroupAdministratorsIds(group.id);
    const admins = await dbAdapter.getUsersByIds(groupAdminsIds);

    const promises = admins.map((adminUser) => {
      return adminNotifier(adminUser);
    });
    await Promise.all(promises);
  }
}

async function getMentionEvents(text, authorId, eventType, firstMentionEventType = eventType) {
  const mentions = _.uniqBy(extractMentionsWithIndices(text), 'username');
  let mentionedUsers = await dbAdapter.getFeedOwnersByUsernames(mentions.map((u) => u.username));
  // Only users (not groups) and not an event author
  mentionedUsers = mentionedUsers.filter((u) => u.isUser() && u.id !== authorId);
  return mentions
    .map(({ username, indices: [start] }) => ({
      event: start === 0 ? firstMentionEventType : eventType,
      user:  mentionedUsers.find((u) => u.username === username),
    }))
    .filter(({ user }) => !!user);
}

async function getDirectEvents(post, authorId, eventType) {
  const destFeeds = await post.getPostedTo();
  const directFeeds = destFeeds.filter((f) => f.isDirects() && f.userId !== authorId);
  const directReceivers = await dbAdapter.getUsersByIds(directFeeds.map((f) => f.userId));
  return directReceivers.map((user) => ({ event: eventType, user }));
}
