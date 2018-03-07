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

  static async onCommentCreated(comment, post, commentAuthor, postAuthor, usersBannedByPostAuthor, usersBannedByCommentAuthor) {
    const postDestinationFeeds = await post.getPostedTo();
    await this._processDirectMessagesForComment(comment, post, commentAuthor, postAuthor, usersBannedByPostAuthor, usersBannedByCommentAuthor, postDestinationFeeds);
    await this._processMentionsInComment(comment, post, commentAuthor, postAuthor, usersBannedByPostAuthor, usersBannedByCommentAuthor, postDestinationFeeds);
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

  static async _processDirectMessagesForComment(comment, post, commentAuthor, postAuthor, usersBannedByPostAuthor, usersBannedByCommentAuthor, postDestinationFeeds) {
    const feeds = postDestinationFeeds;
    const directFeeds = feeds.filter((f) => {
      return f.isDirects() && f.userId !== commentAuthor.id;
    });

    if (directFeeds.length > 0) {
      const directReceiversIds = directFeeds.map((f) => {
        return f.userId;
      });

      let directReceivers = await dbAdapter.getUsersByIds(directReceiversIds);

      directReceivers = directReceivers.filter((r) => {
        return !usersBannedByCommentAuthor.includes(r.id);
      });

      const promises = directReceivers.map(async (receiver) => {
        let usersBannedByReceiver = [];
        if (receiver.id === commentAuthor.id) {
          usersBannedByReceiver = usersBannedByCommentAuthor;
        } else {
          usersBannedByReceiver = receiver.id === postAuthor.id ? usersBannedByPostAuthor : (await receiver.getBanIds());
        }

        if (usersBannedByReceiver.includes(commentAuthor.id)) {
          return null;
        }
        await dbAdapter.createEvent(receiver.intId, EVENT_TYPES.DIRECT_COMMENT_CREATED, commentAuthor.intId, receiver.intId, null, post.id, comment.id, postAuthor.intId);
        return pubSub.updateUnreadNotifications(receiver.intId);
      });
      await Promise.all(promises);
    }
  }

  static async _processMentionsInComment(comment, post, commentAuthor, postAuthor, usersBannedByPostAuthor, usersBannedByCommentAuthor, postDestinationFeeds) {
    let mentions = extractMentionsWithIndices(comment.body);

    if (mentions.length == 0) {
      return;
    }

    let  postGroupIntId = null;
    const feeds = postDestinationFeeds;
    if (feeds.length === 1) {
      const feedOwner = await feeds[0].getUser();
      if (feedOwner.type === 'group') {
        postGroupIntId = feedOwner.intId;
      }
    }

    const postDestinationsFeedsOwners = feeds.map((f) => f.userId);
    const nonDirectFeeds = feeds.filter((f) => !f.isDirects());
    const nonDirectFeedsIds = nonDirectFeeds.map((f) => f.id);
    const nonDirectFeedsOwnerIds = nonDirectFeeds.map((f) => f.userId);
    const postIsPublic = await dbAdapter.someUsersArePublic(nonDirectFeedsOwnerIds, false);

    const replyToUser = mentions.find((m) => m.indices[0] === 0);

    if (replyToUser) {
      _.remove(mentions, (m) => {
        return m.username === replyToUser.username && m.indices[0] != 0;
      });
    }
    mentions = _.uniqBy(mentions, 'username');

    const mentionedUsers = await dbAdapter.getFeedOwnersByUsernames(mentions.map((m) => m.username));
    let usersSubscriptionsStatus = [];
    if (!postIsPublic) {
      usersSubscriptionsStatus = await dbAdapter.areUsersSubscribedToOneOfTimelines(mentionedUsers.map((u) => u.id), nonDirectFeedsIds);
    }
    const promises = mentions.map(async (m) => {
      const mentionedUser = mentionedUsers.find((u) => u.username === m.username);
      if (!mentionedUser || mentionedUser.type !== 'user') {
        return null;
      }

      if (commentAuthor.id === mentionedUser.id) {
        return null;
      }

      if (usersBannedByPostAuthor.includes(mentionedUser.id) || usersBannedByCommentAuthor.includes(mentionedUser.id)) {
        return null;
      }

      const usersBannedByCurrentUser = await mentionedUser.getBanIds();
      if (usersBannedByCurrentUser.includes(commentAuthor.id) || usersBannedByCurrentUser.includes(postAuthor.id)) {
        return null;
      }

      if (!postDestinationsFeedsOwners.includes(mentionedUser.id)) {
        if (nonDirectFeeds.length === 0) {
          return null;
        }

        if (!postIsPublic) {
          const subscriptionStatus = usersSubscriptionsStatus.find((u) => u.uid === mentionedUser.id);
          if (!subscriptionStatus.is_subscribed) {
            return null;
          }
        }
      }

      if (m.indices[0] === 0) {
        await dbAdapter.createEvent(mentionedUser.intId, EVENT_TYPES.MENTION_COMMENT_TO, commentAuthor.intId, mentionedUser.intId, postGroupIntId, post.id, comment.id, postAuthor.intId);
      } else {
        await dbAdapter.createEvent(mentionedUser.intId, EVENT_TYPES.MENTION_IN_COMMENT, commentAuthor.intId, mentionedUser.intId, postGroupIntId, post.id, comment.id, postAuthor.intId);
      }
      return pubSub.updateUnreadNotifications(mentionedUser.intId);
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
