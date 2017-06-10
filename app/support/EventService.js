import _ from 'lodash'
import { dbAdapter } from '../models'
import { extractMentions, extractMentionsWithIndices } from './mentions'

export const EVENT_TYPES = {
  MENTION_IN_POST:               'mention_in_post',
  MENTION_IN_COMMENT:            'mention_in_comment',
  MENTION_COMMENT_TO:            'mention_comment_to',
  USER_BANNED:                   'banned_user',
  USER_UNBANNED:                 'unbanned_user',
  BANNED_BY:                     'banned_by_user',
  UNBANNED_BY:                   'unbanned_by_user',
  USER_SUBSCRIBED:               'user_subscribed',
  USER_UNSUBSCRIBED:             'user_unsubscribed',
  SUBSCRIPTION_REQUESTED:        'subscription_requested',
  SUBSCRIPTION_REQUEST_REVOKED:  'subscription_request_revoked',
  SUBSCRIPTION_REQUEST_APPROVED: 'subscription_request_approved',
  SUBSCRIPTION_REQUEST_REJECTED: 'subscription_request_rejected',
  GROUP_CREATED:                 'group_created',
  GROUP_SUBSCRIBED:              'group_subscribed',
  GROUP_UNSUBSCRIBED:            'group_unsubscribed',
  GROUP_SUBSCRIPTION_REQUEST:    'group_subscription_requested',
  GROUP_REQUEST_REVOKED:         'group_subscription_request_revoked',
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

  static async onSubscriptionRequestRevoked(fromUserIntId, toUserIntId) {
    await dbAdapter.createEvent(toUserIntId, EVENT_TYPES.SUBSCRIPTION_REQUEST_REVOKED, fromUserIntId, toUserIntId);
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

  static async onGroupSubscriptionRequestRevoked(initiatorIntId, group) {
    await this._notifyGroupAdmins(group, (adminUser) => {
      return dbAdapter.createEvent(adminUser.intId, EVENT_TYPES.GROUP_REQUEST_REVOKED, initiatorIntId, initiatorIntId, group.intId);
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

  static async onCommentCreated(comment, post, commentAuthor, postAuthor) {
    await this._processDirectMessagesForComment(comment, post, commentAuthor, postAuthor);
    await this._processMentionsInComment(comment, post, commentAuthor, postAuthor);
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
        return dbAdapter.createEvent(receiver.intId, EVENT_TYPES.DIRECT_CREATED, author.intId, receiver.intId, null, post.id, null, author.intId);
      });
      await Promise.all(promises);
    }
  }

  static async _processMentionsInPost(post, destinationFeedIds, author) {
    const mentionedUsernames = _.uniq(extractMentions(post.body));
    let postGroupIntId = null;
    if (destinationFeedIds.length === 1) {
      const postFeed = await dbAdapter.getTimelineById(destinationFeedIds[0]);
      const feedOwner = await postFeed.getUser();
      if (feedOwner.type === 'group') {
        postGroupIntId = feedOwner.intId;
      }
    }

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

      return dbAdapter.createEvent(user.intId, EVENT_TYPES.MENTION_IN_POST, author.intId, user.intId, postGroupIntId, post.id, null, author.intId);
    });
    await Promise.all(promises);
  }

  static async _processDirectMessagesForComment(comment, post, commentAuthor, postAuthor) {
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
        return dbAdapter.createEvent(receiver.intId, EVENT_TYPES.DIRECT_COMMENT_CREATED, commentAuthor.intId, receiver.intId, null, post.id, comment.id, postAuthor.intId);
      });
      await Promise.all(promises);
    }
  }

  static async _processMentionsInComment(comment, post, commentAuthor, postAuthor) {
    let mentions = extractMentionsWithIndices(comment.body);

    if (mentions.length == 0) {
      return;
    }

    let  postGroupIntId = null;
    const feeds = await post.getPostedTo();
    if (feeds.length === 1) {
      const feedOwner = await feeds[0].getUser();
      if (feedOwner.type === 'group') {
        postGroupIntId = feedOwner.intId;
      }
    }

    const replyToUser = mentions.find((m) => { return m.indices[0] === 0; });

    if (replyToUser) {
      _.remove(mentions, (m) => { return m.username == replyToUser.username && m.indices[0] != 0; });
    }
    mentions = _.uniqBy(mentions, 'username');

    const usersBannedByPostAuthor = await postAuthor.getBanIds();
    const usersBannedByCommentAuthor = await commentAuthor.getBanIds();

    const promises = mentions.map(async (m) => {
      const username = m.username;
      const mentionedUser = await dbAdapter.getFeedOwnerByUsername(username);
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

      const isVisible = await post.canShow(mentionedUser.id);
      if (!isVisible) {
        return null;
      }

      if (m.indices[0] === 0) {
        return dbAdapter.createEvent(mentionedUser.intId, EVENT_TYPES.MENTION_COMMENT_TO, commentAuthor.intId, mentionedUser.intId, postGroupIntId, post.id, comment.id, postAuthor.intId);
      }
      return dbAdapter.createEvent(mentionedUser.intId, EVENT_TYPES.MENTION_IN_COMMENT, commentAuthor.intId, mentionedUser.intId, postGroupIntId, post.id, comment.id, postAuthor.intId);
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
