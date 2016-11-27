import _ from 'lodash'
import monitor from 'monitor-dog'
import { dbAdapter } from '../../../models'
import { reportError } from '../../../support/exceptions'
import { serializeSelfUser, serializeUser } from '../../../serializers/v2/user'

export default class UsersController {
  static async blockedByMe(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    try {
      const banIds = await req.user.getBanIds()
      const bannedUsers = await dbAdapter.getUsersByIds(banIds)
      const profilePicsPromises = bannedUsers.map(async (user) => {
        const request = _.pick(user, ['id', 'username', 'screenName'])
        request.profilePictureLargeUrl = await user.getProfilePictureLargeUrl()
        request.profilePictureMediumUrl = await user.getProfilePictureMediumUrl()
        return request
      })
      const result = await Promise.all(profilePicsPromises)
      res.jsonp(result)
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async getUnreadDirectsNumber(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }
    const timer = monitor.timer('users.unread-directs')
    try {
      const unreadDirectsNumber = await dbAdapter.getUnreadDirectsNumber(req.user.id)
      res.jsonp({ unread: unreadDirectsNumber })
      monitor.increment('users.unread-directs-requests')
    } catch (e) {
      reportError(res)(e)
    } finally {
      timer.stop()
    }
  }

  static async markAllDirectsAsRead(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }
    try {
      await dbAdapter.markAllDirectsAsRead(req.user.id)
      res.jsonp({ message: `Directs are now marked as read for ${req.user.id}` })
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async whoAmI(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' });
      return;
    }
    const timer = monitor.timer('users.whoami-v2');
    try {
      const [
        users,
        subscribers, // actually there are friends of req.user
        subscriptions,
      ] = await Promise.all([
        serializeSelfUser(req.user),
        (async () => {
          const friends = await req.user.getFriends();
          return friends.map((s) => serializeUser(s));
        })(),
        (async () => {
          const timelines = await dbAdapter.getTimelinesUserSubscribed(req.user.id, 'Posts');
          return timelines.map((t) => ({ id: t.id, name: t.name, user: t.userId }));
        })(),
      ]);
      res.jsonp({ users, subscribers, subscriptions });
    } catch (e) {
      reportError(res)(e);
    } finally {
      timer.stop();
    }
  }
}
