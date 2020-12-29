import compose from 'koa-compose';

import { dbAdapter } from '../../../models';
import { serializeFeed } from '../../../serializers/v2/post';
import { monitored, authRequired, targetUserRequired } from '../../middlewares';

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
    let activities = [];

    // Get timelines that forms a "RiverOfNews" of current user
    const homeFeed = await currentUser.getRiverOfNewsTimeline();
    ({ destinations, activities } = await dbAdapter.getSubscriprionsIntIds(homeFeed));

    // Get posts current user subscribed to
    const foundPostsIds = await dbAdapter.getSummaryPostsIds(
      currentUser.id,
      days,
      destinations,
      activities,
      limit,
    );

    ctx.body = await serializeFeed(foundPostsIds, currentUser.id, null, { isLastPage: true });
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
    const foundPostsIds = await dbAdapter.getSummaryPostsIds(currentUserId, days, [timelineIntId]);

    ctx.body = await serializeFeed(foundPostsIds, currentUserId, null, { isLastPage: true });
  },
]);
