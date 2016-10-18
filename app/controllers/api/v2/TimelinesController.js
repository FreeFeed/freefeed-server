import monitor from 'monitor-dog'
import { dbAdapter } from '../../../models'
import { reportError } from '../../../support/exceptions'
import { serializePostsCollection } from '../../../serializers/v2/post';

export default class TimelinesController {
  app = null;

  constructor(app) {
    this.app = app;
  }

  bestOf = async (req, res) => {
    const timer = monitor.timer('timelines.bestof-time')

    try {
      const DEFAULT_LIMIT = 30;

      const currentUserId = req.user ? req.user.id : null;
      const offset = parseInt(req.query.offset, 10) || 0;
      const limit =  parseInt(req.query.limit, 10) || DEFAULT_LIMIT;

      const foundPosts = await dbAdapter.bestPosts(req.user, offset, limit);
      const postsObjects = dbAdapter.initRawPosts(foundPosts, { currentUser: currentUserId });
      const postsCollectionJson = await serializePostsCollection(postsObjects);

      res.jsonp(postsCollectionJson);
      monitor.increment('timelines.bestof-requests')
    } catch (e) {
      reportError(res)(e);
    } finally {
      timer.stop()
    }
  };
}
