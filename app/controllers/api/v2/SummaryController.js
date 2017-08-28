import { dbAdapter } from '../../../models'
import { NotFoundException, ForbiddenException } from '../../../support/exceptions'
import { serializePostsCollection } from '../../../serializers/v2/post';
import { monitored, authRequired } from './helpers';

export default class SummaryController {
  static generalSummary = authRequired(monitored('summary.general', async (ctx) => {
    const DEFAULT_DAYS = 7;
    const currentUser = ctx.state.user;
    const days = parseInt(ctx.params.days, 10) || DEFAULT_DAYS;

    // Get timeline "RiverOfNews" of current user
    const [timelineIntId] = await dbAdapter.getUserNamedFeedsIntIds(currentUser.id, ['RiverOfNews']);

    // Get posts current user subscribed to
    const foundPosts = await dbAdapter.getSummaryPosts(currentUser.id, timelineIntId, days);

    const postsObjects = dbAdapter.initRawPosts(foundPosts, { currentUser: currentUser.id });

    ctx.body = await serializePostsCollection(postsObjects);
  }));
}
