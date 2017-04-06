import { dbAdapter } from '../models'
import { extractMentions } from './mentions'

const EVENT_TYPES = {
  MENTION_IN_POST:               'mention_in_post',
  USER_BANNED:                   'banned_user',
  USER_UNBANNED:                 'unbanned_user',
  BANNED_BY:                     'banned_by_user',
  UNBANNED_BY:                   'unbanned_by_user',
  USER_SUBSCRIBED:               'user_subscribed',
  USER_UNSUBSCRIBED:             'user_unsubscribed',
  SUBSCRIPTION_REQUESTED:        'subscription_requested',
  SUBSCRIPTION_REQUEST_APPROVED: 'subscription_request_approved',
  SUBSCRIPTION_REQUEST_REJECTED: 'subscription_request_rejected',
  GROUP_CREATED:                 'group_created',
  GROUP_SUBSCRIBED:              'group_subscribed',
  GROUP_UNSUBSCRIBED:            'group_unsubscribed',
  GROUP_SUBSCRIPTION_REQUEST:    'group_subscription_requested',
  GROUP_SUBSCRIPTION_APPROVED:   'group_subscription_approved',
  GROUP_SUBSCRIPTION_REJECTED:   'group_subscription_rejected',
  GROUP_ADMIN_PROMOTED:          'group_admin_promoted',
  GROUP_ADMIN_DEMOTED:           'group_admin_demoted',
  DIRECT_CREATED:                'direct',
  DIRECT_COMMENT_CREATED:        'direct_comment',
};

export class EventService {
  static async onUserBanned(initiatorIntId, bannedUserIntId, wasSubscribed = false, hasRequestedSubscription = false) {
    await dbAdapter.createEvent(initiatorIntId, EVENT_TYPES.USER_BANNED, initiatorIntId, bannedUserIntId);
    await dbAdapter.createEvent(bannedUserIntId, EVENT_TYPES.BANNED_BY, initiatorIntId, bannedUserIntId);
    if (wasSubscribed) {
      await this.onUserUnsubscribed(bannedUserIntId, initiatorIntId);
    }
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
  }

  static async onUserUnsubscribed(initiatorIntId, unsubscribedUserIntId) {
    await dbAdapter.createEvent(unsubscribedUserIntId, EVENT_TYPES.USER_UNSUBSCRIBED, initiatorIntId, unsubscribedUserIntId);
  }

  static async onSubscriptionRequestCreated(fromUserIntId, toUserIntId) {
    await dbAdapter.createEvent(toUserIntId, EVENT_TYPES.SUBSCRIPTION_REQUESTED, fromUserIntId, toUserIntId);
  }

  static async onSubscriptionRequestApproved(fromUserIntId, toUserIntId) {
    await dbAdapter.createEvent(fromUserIntId, EVENT_TYPES.SUBSCRIPTION_REQUEST_APPROVED, toUserIntId, fromUserIntId);
    await dbAdapter.createEvent(toUserIntId, EVENT_TYPES.USER_SUBSCRIBED, fromUserIntId, toUserIntId);
  }

  static async onSubscriptionRequestRejected(fromUserIntId, toUserIntId) {
    await dbAdapter.createEvent(fromUserIntId, EVENT_TYPES.SUBSCRIPTION_REQUEST_REJECTED, toUserIntId, fromUserIntId);
  }

  static async onGroupCreated(ownerIntId, groupIntId) {
    await dbAdapter.createEvent(ownerIntId, EVENT_TYPES.GROUP_CREATED, ownerIntId, null, groupIntId);
  }

  static async onGroupSubscribed(initiatorIntId, subscribedGroup) {
    await this._notifyGroupAdmins(subscribedGroup, (adminUser) => {
      return dbAdapter.createEvent(adminUser.intId, EVENT_TYPES.GROUP_SUBSCRIBED, initiatorIntId, null, subscribedGroup.intId);
    });
  }

  static async onGroupUnsubscribed(initiatorIntId, unsubscribedGroup) {
    await this._notifyGroupAdmins(unsubscribedGroup, (adminUser) => {
      return dbAdapter.createEvent(adminUser.intId, EVENT_TYPES.GROUP_UNSUBSCRIBED, initiatorIntId, null, unsubscribedGroup.intId);
    });
  }

  static async onGroupAdminPromoted(initiatorIntId, group, newAdminIntId) {
    await this._notifyGroupAdmins(group, (adminUser) => {
      if (adminUser.intId === newAdminIntId) {
        return null;
      }
      return dbAdapter.createEvent(adminUser.intId, EVENT_TYPES.GROUP_ADMIN_PROMOTED, initiatorIntId, newAdminIntId, group.intId);
    });
  }

  static async onGroupAdminDemoted(initiatorIntId, group, formerAdminIntId) {
    await this._notifyGroupAdmins(group, (adminUser) => {
      if (adminUser.intId === formerAdminIntId) {
        return null;
      }
      return dbAdapter.createEvent(adminUser.intId, EVENT_TYPES.GROUP_ADMIN_DEMOTED, initiatorIntId, formerAdminIntId, group.intId);
    });
  }

  static async onGroupSubscriptionRequestCreated(initiatorIntId, group) {
    await this._notifyGroupAdmins(group, (adminUser) => {
      return dbAdapter.createEvent(adminUser.intId, EVENT_TYPES.GROUP_SUBSCRIPTION_REQUEST, initiatorIntId, initiatorIntId, group.intId);
    });
  }

  static async onGroupSubscriptionRequestApproved(adminIntId, group, requesterIntId) {
    await this._notifyGroupAdmins(group, (adminUser) => {
      return dbAdapter.createEvent(adminUser.intId, EVENT_TYPES.GROUP_SUBSCRIPTION_APPROVED, adminIntId, requesterIntId, group.intId);
    });
    await dbAdapter.createEvent(requesterIntId, EVENT_TYPES.GROUP_SUBSCRIPTION_APPROVED, adminIntId, requesterIntId, group.intId);
  }

  static async onGroupSubscriptionRequestRejected(adminIntId, group, requesterIntId) {
    await this._notifyGroupAdmins(group, (adminUser) => {
      return dbAdapter.createEvent(adminUser.intId, EVENT_TYPES.GROUP_SUBSCRIPTION_REJECTED, adminIntId, requesterIntId, group.intId);
    });
    await dbAdapter.createEvent(requesterIntId, EVENT_TYPES.GROUP_SUBSCRIPTION_REJECTED, null, requesterIntId, group.intId);
  }

  static async onPostCreated(post, destinationFeedIds, author) {
    await this._processDirectMessagesForPost(post, destinationFeedIds, author);
    await this._processMentionsInPost(post, destinationFeedIds, author);
  }

  static async onCommentCreated(comment, post, commentAuthor) {
    await this._processDirectMessagesForComment(comment, post, commentAuthor);
  }


  ////////////////////////////////////////////

  static async _processDirectMessagesForPost(post, destinationFeedIds, author) {
    const feeds = await dbAdapter.getTimelinesByIds(destinationFeedIds);
    const directFeeds = feeds.filter((f) => {
      return f.isDirects() && f.userId !== author.id;
    });

    if (directFeeds.length > 0) {
      const directReceiversIds = directFeeds.map((f) => {
        return f.userId;
      });

      const directReceivers = await dbAdapter.getUsersByIds(directReceiversIds);
      const promises = directReceivers.map((receiver) => {
        return dbAdapter.createEvent(receiver.intId, EVENT_TYPES.DIRECT_CREATED, author.intId, receiver.intId, null, post.id);
      });
      await Promise.all(promises);
    }
  }

  static async _processMentionsInPost(post, destinationFeedIds, author) {
    const mentionedUsernames = extractMentions(post.body);
    const usersBannedByPostAuthor = await author.getBanIds();
    const promises = mentionedUsernames.map(async (username) => {
      const user = await dbAdapter.getFeedOwnerByUsername(username);
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

      const isVisible = await post.canShow(user.id);
      if (!isVisible) {
        return null;
      }

      return dbAdapter.createEvent(user.intId, EVENT_TYPES.MENTION_IN_POST, author.intId, user.intId, null, post.id);
    });
    await Promise.all(promises);
  }

  static async _processDirectMessagesForComment(comment, post, commentAuthor) {
    const feeds = await post.getPostedTo();
    const directFeeds = feeds.filter((f) => {
      return f.isDirects() && f.userId !== commentAuthor.id;
    });

    if (directFeeds.length > 0) {
      const directReceiversIds = directFeeds.map((f) => {
        return f.userId;
      });

      let directReceivers = await dbAdapter.getUsersByIds(directReceiversIds);

      const usersBannedByCommentAuthor = await commentAuthor.getBanIds();
      directReceivers = directReceivers.filter((r) => {
        return !usersBannedByCommentAuthor.includes(r.id);
      });

      const promises = directReceivers.map(async (receiver) => {
        const usersBannedByReceiver = await receiver.getBanIds();
        if (usersBannedByReceiver.includes(commentAuthor.id)) {
          return null;
        }
        return dbAdapter.createEvent(receiver.intId, EVENT_TYPES.DIRECT_COMMENT_CREATED, commentAuthor.intId, receiver.intId, null, post.id, comment.id);
      });
      await Promise.all(promises);
    }
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
