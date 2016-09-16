import { dbAdapter } from '../../../models'
import { reportError } from '../../../support/exceptions'
import { serializePostsCollection } from '../../../serializers/v2/post';

export default class TimelinesController {
  app = null;

  constructor(app) {
    this.app = app;
  }

  bestOf = async (req, res) => {
    try {
      const currentUserId = req.user ? req.user.id : null;

      const foundPosts = await dbAdapter.bestPosts(req.user);
      const postsObjects = dbAdapter.initRawPosts(foundPosts, { currentUser: currentUserId });
      const postsCollectionJson = await serializePostsCollection(postsObjects);

      res.jsonp(postsCollectionJson);
    } catch (e) {
      reportError(res)(e);
    }
  };
}
