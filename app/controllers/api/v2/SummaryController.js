import monitor from 'monitor-dog'
import { dbAdapter } from '../../../models'
import { reportError, NotFoundException, ForbiddenException } from '../../../support/exceptions'
import { serializePostsCollection } from '../../../serializers/v2/post';

export default class SummaryController {
  static async generalSummary(req, res) {
    const timer = monitor.timer('summary.general')

    if (!req.user) {
      res.status(401).jsonp({ err: 'Unauthorized', status: 'fail' });
      return
    }

    try {
      const DEFAULT_DAYS = 7;
      const currentUser = req.user;
      const days = parseInt(req.params.days, 10) || DEFAULT_DAYS;

      // Get timeline "RiverOfNews" of current user
      const [timelineIntId] = await dbAdapter.getUserNamedFeedsIntIds(currentUser.id, ['RiverOfNews']);

      // Get posts current user subscribed to
      const foundPosts = await dbAdapter.getSummaryPosts(currentUser.id, timelineIntId, days);

      const postsObjects = dbAdapter.initRawPosts(foundPosts, { currentUser: currentUser.id });
      const postsCollectionJson = await serializePostsCollection(postsObjects);

      res.jsonp(postsCollectionJson);

      monitor.increment('summary.general-requests')
    } catch (e) {
      reportError(res)(e);
    } finally {
      timer.stop()
    }
  }

  static async userSummary(req, res) {
    const timer = monitor.timer('summary.user');

    try {
      const DEFAULT_DAYS = 7;
      const username = req.params.username;
      const targetUser = await dbAdapter.getFeedOwnerByUsername(username);

      if (targetUser === null) {
        throw new NotFoundException(`Feed "${username}" is not found`);
      }

      const currentUser = req.user;
      const days = parseInt(req.params.days, 10) || DEFAULT_DAYS;

      // Get timeline "Posts" of target user
      const [timelineIntId] = await dbAdapter.getUserNamedFeedsIntIds(targetUser.id, ['Posts']);

      // Check if it's OK to show the feed
      const timeline = await dbAdapter.getTimelineByIntId(timelineIntId);
      if (!timeline.canShow(currentUser)) {
        throw new ForbiddenException('Forbidden');
      }

      // Get posts authored by target user, and provide current user (the reader) for filtering
      const foundPosts = await dbAdapter.getSummaryPosts(currentUser.id, timelineIntId, days);

      const postsObjects = dbAdapter.initRawPosts(foundPosts, { currentUser: currentUser.id });
      const postsCollectionJson = await serializePostsCollection(postsObjects);

      res.jsonp(postsCollectionJson);

      monitor.increment('summary.user-requests')
    } catch (e) {
      reportError(res)(e);
    } finally {
      timer.stop()
    }
  }
}
