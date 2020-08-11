import compose from 'koa-compose';
import _ from 'lodash'
import monitor from 'monitor-dog'

import { dbAdapter, PubSub as pubSub } from '../../../models'
import { serializeSelfUser, serializeUsersByIds, userSerializerFunction } from '../../../serializers/v2/user'
import { monitored, authRequired } from '../../middlewares';


export default class UsersController {
  static blockedByMe = compose([
    authRequired(),
    async (ctx) => {
      const { state: { user } } = ctx;
      const banIds = await user.getBanIds();
      const users = await serializeUsersByIds(banIds, false);
      ctx.body = banIds.map((id) => users.find((u) => u.id === id));
    },
  ]);

  static async getUnreadDirectsNumber(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return
    }

    const timer = monitor.timer('users.unread-directs')

    try {
      const unreadDirectsNumber = await dbAdapter.getUnreadDirectsNumber(ctx.state.user.id)
      ctx.body = { unread: unreadDirectsNumber };
      monitor.increment('users.unread-directs-requests')
    } finally {
      timer.stop()
    }
  }

  static async getUnreadNotificationsNumber(ctx) {
    if (!ctx.state.user) {
      ctx.status = 403;
      ctx.body = { err: 'Unauthorized' };
      return;
    }

    const unreadNotificationsNumber = await dbAdapter.getUnreadEventsNumber(ctx.state.user.id);
    ctx.body = { unread: unreadNotificationsNumber };
  }

  static async markAllDirectsAsRead(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return
    }

    await dbAdapter.markAllDirectsAsRead(ctx.state.user.id)
    await pubSub.updateUnreadDirects(ctx.state.user.id);
    ctx.body = { message: `Directs are now marked as read for ${ctx.state.user.id}` };
  }

  static async markAllNotificationsAsRead(ctx) {
    if (!ctx.state.user) {
      ctx.status = 403;
      ctx.body = { err: 'Unauthorized' };
      return;
    }

    await dbAdapter.markAllEventsAsRead(ctx.state.user.id);
    await pubSub.updateUnreadNotifications(ctx.state.user.intId);
    ctx.body = { message: `Notifications are now marked as read for ${ctx.state.user.id}` };
  }

  static whoAmI = compose([
    authRequired(),
    monitored({
      timer:    'users.whoami-v2',
      requests: 'users.whoami-v2-requests'
    }),
    async (ctx) => {
      const { state: { user, authToken } } = ctx;

      const [
        users,
        timelinesUserSubscribed,
        subscribersUIDs, // UIDs of users subscribed to the our user
        pendingSubscriptionRequestsUIDs,
        subscriptionRequestsUIDs,
        managedGroupUIDs,
        pendingGroupRequests,
        archiveParams,
      ] = await Promise.all([
        serializeSelfUser(user),
        dbAdapter.getTimelinesUserSubscribed(user.id, 'Posts'),
        user.getSubscriberIds(),
        user.getPendingSubscriptionRequestIds(),
        user.getSubscriptionRequestIds(),
        dbAdapter.getManagedGroupIds(user.id),
        dbAdapter.getPendingGroupRequests(user.id),
        dbAdapter.getUserArchiveParams(user.id),
      ]);

      if (archiveParams) {
        users.privateMeta.archives = archiveParams;
      }

      const subscriptions = timelinesUserSubscribed.map((t) => ({ id: t.id, name: t.name, user: t.userId }));
      const subscriptionsUIDs = _.map(subscriptions, 'user'); // UIDs of users our user subscribed to
      const groupRequestersUIDs = [].concat(...Object.values(pendingGroupRequests));

      const allUIDs = _.union(
        subscribersUIDs,
        subscriptionsUIDs,
        pendingSubscriptionRequestsUIDs,
        subscriptionRequestsUIDs,
        managedGroupUIDs,
        groupRequestersUIDs,
        users.banIds,
      );

      const [
        allUsers,
        allStats,
      ] = await Promise.all([
        dbAdapter.getUsersByIdsAssoc(allUIDs),
        dbAdapter.getUsersStatsAssoc(allUIDs),
      ]);
      const allGroupAdmins = await dbAdapter.getGroupsAdministratorsIds(_.map(_.filter(allUsers, { type: 'group' }), 'id'), user.id);

      const serializeUser = userSerializerFunction(allUsers, allStats, allGroupAdmins);

      users.pendingGroupRequests = groupRequestersUIDs.length > 0;
      users.pendingSubscriptionRequests = pendingSubscriptionRequestsUIDs;
      users.subscriptionRequests = subscriptionRequestsUIDs;
      users.subscriptions = _.map(timelinesUserSubscribed, 'id');
      users.subscribers = subscribersUIDs.map(serializeUser);
      const subscribers = subscriptionsUIDs.map(serializeUser);
      const requests = _.union(pendingSubscriptionRequestsUIDs, subscriptionRequestsUIDs).map(serializeUser);
      const managedGroups = managedGroupUIDs
        .map(serializeUser)
        .map((group) => {
          group.requests = (pendingGroupRequests[group.id] || []).map(serializeUser);
          return group;
        });

      // Only full access tokens can see privateMeta
      if (!authToken.hasFullAccess()) {
        users.privateMeta = {};
      }

      ctx.body = { users, subscribers, subscriptions, requests, managedGroups };
    },
  ]);
}
