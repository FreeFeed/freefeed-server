import monitor from 'monitor-dog'
import { dbAdapter } from '../../../models'
import { serializePostsCollection } from '../../../serializers/v2/post';

export default class TimelinesController {
  app = null;

  constructor(app) {
    this.app = app;
  }

  bestOf = async (ctx) => {
    const timer = monitor.timer('timelines.bestof-time')

    try {
      const DEFAULT_LIMIT = 30;

      const currentUserId = ctx.state.user ? ctx.state.user.id : null;
      const offset = parseInt(ctx.request.query.offset, 10) || 0;
      const limit =  parseInt(ctx.request.query.limit, 10) || DEFAULT_LIMIT;

      const foundPosts = await dbAdapter.bestPosts(ctx.state.user, offset, limit);
      const postsObjects = dbAdapter.initRawPosts(foundPosts, { currentUser: currentUserId });

      ctx.body = await serializePostsCollection(postsObjects);
      monitor.increment('timelines.bestof-requests')
    } finally {
      timer.stop()
    }
  };
}
