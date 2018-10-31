import compose from 'koa-compose';

import { dbAdapter } from '../../../models'
import { load as configLoader } from '../../../../config/config';
import { serializePostsCollection } from '../../../serializers/v2/post';
import { serializeUser } from '../../../serializers/v2/user';
import { monitored, authRequired, targetUserRequired } from '../../middlewares';


const config = configLoader();

const getDays = (d) => {
  const DEFAULT_DAYS = 7;
  const MIN_DAYS = 1;
  const MAX_DAYS = 30;
  const days = parseInt(d, 10) || DEFAULT_DAYS;
  return Math.max(MIN_DAYS, Math.min(MAX_DAYS, days));
};

export const generalSummary = compose([
  authRequired(),
  monitored('summary.general'),
  async (ctx) => {
    const days = getDays(ctx.params.days);
    const limit = parseInt(ctx.request.query.limit, 10) || null;

    const currentUser = ctx.state.user;

    let destinations = [];
    let activities  = [];

    if (config.dynamicRiverOfNews) {
      // Get timelines that forms a "RiverOfNews" of current user
      ({ destinations, activities } = await dbAdapter.getSubscriprionsIntIds(currentUser.id));
    } else {
      // Get timeline "RiverOfNews" of current user
      destinations = await dbAdapter.getUserNamedFeedsIntIds(currentUser.id, ['RiverOfNews']);
    }

    // Get posts current user subscribed to
    const foundPosts = await dbAdapter.getSummaryPosts(currentUser.id, days, destinations, activities, limit);

    const postsObjects = dbAdapter.initRawPosts(foundPosts, { currentUser: currentUser.id });

    ctx.body = await serializePostsCollection(postsObjects, currentUser.id);
    ctx.body.isLastPage = true;
  },
]);

export const userSummary = compose([
  targetUserRequired(),
  monitored('summary.user'),
  async (ctx) => {
    const { targetUser } = ctx.state;

    const days = getDays(ctx.params.days);

    const currentUserId = ctx.state.user ? ctx.state.user.id : null;

    // Get timeline "Posts" of target user
    const [timelineIntId] = await dbAdapter.getUserNamedFeedsIntIds(targetUser.id, ['Posts']);

    // Get posts authored by target user, and provide current user (the reader) for filtering
    const foundPosts = await dbAdapter.getSummaryPosts(currentUserId, days, [timelineIntId]);

    // Serialize for the response
    if (foundPosts.length > 0) {
      const postsObjects = dbAdapter.initRawPosts(foundPosts, { currentUser: currentUserId });

      ctx.body = await serializePostsCollection(postsObjects, currentUserId);
      ctx.body.isLastPage = true;
    } else {
      const [allUsersAssoc, allStatsAssoc] = await Promise.all([
        dbAdapter.getUsersByIdsAssoc([targetUser.id]),
        dbAdapter.getUsersStatsAssoc([targetUser.id]),
      ]);

      const defaultStats = { posts: '0', likes: '0', comments: '0', subscribers: '0', subscriptions: '0' };

      const users = [{
        ...serializeUser(allUsersAssoc[targetUser.id]),
        statistics: allStatsAssoc[targetUser.id] || defaultStats
      }];

      ctx.body = {
        admins:        [],
        attachments:   [],
        comments:      [],
        isLastPage:    true,
        posts:         [],
        subscribers:   [],
        subscriptions: [],
        timelines:     [],
        users
      };
    }
  },
]);
