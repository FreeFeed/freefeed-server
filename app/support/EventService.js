import { dbAdapter } from '../models'

const EVENT_TYPES = {
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
}
