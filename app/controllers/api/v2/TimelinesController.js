import { escape as urlEscape } from 'querystring';

import _ from 'lodash';
import compose from 'koa-compose';
import config from 'config';

import {
  HOMEFEED_MODE_CLASSIC,
  HOMEFEED_MODE_FRIENDS_ALL_ACTIVITY,
  HOMEFEED_MODE_FRIENDS_ONLY,
} from '../../../models/timeline';
import { serializeFeed } from '../../../serializers/v2/post';
import { monitored, authRequired, targetUserRequired } from '../../middlewares';
import { NotFoundException } from '../../../support/exceptions';

export const ORD_UPDATED = 'bumped';
export const ORD_CREATED = 'created';

export const bestOf = compose([
  monitored('timelines.bestof'),
  async (ctx) => {
    const DEFAULT_LIMIT = 30;

    const currentUserId = ctx.state.user ? ctx.state.user.id : null;
    const offset = parseInt(ctx.request.query.offset, 10) || 0;
    const limit = parseInt(ctx.request.query.limit, 10) || DEFAULT_LIMIT;

    const foundPostsIds = await ctx.modelRegistry.dbAdapter.bestPostsIds(
      ctx.state.user,
      offset,
      limit + 1,
    );
    const isLastPage = foundPostsIds.length <= limit;

    if (!isLastPage) {
      foundPostsIds.length = limit;
    }

    ctx.body = await serializeFeed(foundPostsIds, currentUserId, null, { isLastPage });
  },
]);

/**
 * Name for data dog
 *
 * @param {string} feedName
 * @returns {string}
 */
function monitoredFeedName(feedName) {
  switch (feedName) {
    case 'RiverOfNews':
      return 'home';
    case 'MyDiscussions':
      return 'my-discussions';
    default:
      return feedName.toLowerCase();
  }
}

export const ownTimeline = (feedName, params = {}) =>
  compose([
    authRequired(),
    monitored(`timelines.${monitoredFeedName(feedName)}-v2`),
    async (ctx) => {
      const { user } = ctx.state;
      let timeline;

      if (ctx.params.feedId) {
        timeline = await ctx.modelRegistry.dbAdapter.getTimelineById(ctx.params.feedId);
      } else {
        timeline = await ctx.modelRegistry.dbAdapter.getUserNamedFeed(user.id, feedName);
      }

      if (!timeline || timeline.userId !== user.id || timeline.name !== feedName) {
        throw new NotFoundException(`Timeline is not found`);
      }

      ctx.body = await genericTimeline(ctx.modelRegistry.dbAdapter, timeline, user.id, {
        ...params,
        ...getCommonParams(ctx),
      });
    },
  ]);

export const userTimeline = (feedName) =>
  compose([
    targetUserRequired(),
    monitored(`timelines.${feedName.toLowerCase()}-v2`),
    async (ctx) => {
      const { targetUser, user: viewer } = ctx.state;
      const timeline = await ctx.modelRegistry.dbAdapter.getUserNamedFeed(targetUser.id, feedName);
      ctx.body = await genericTimeline(
        ctx.modelRegistry.dbAdapter,
        timeline,
        viewer ? viewer.id : null,
        {
          withoutDirects: feedName !== 'Posts',
          ...getCommonParams(ctx),
        },
      );
    },
  ]);

export const everything = compose([
  monitored(`timelines.everything`),
  async (ctx) => {
    const { user: viewer } = ctx.state;
    ctx.body = await genericTimeline(
      ctx.modelRegistry.dbAdapter,
      null,
      viewer ? viewer.id : null,
      getCommonParams(ctx),
    );
  },
]);

export const metatags = compose([
  monitored(`timelines-metatags`),
  async (ctx) => {
    const { username } = ctx.params;
    const targetUser = await ctx.modelRegistry.dbAdapter.getFeedOwnerByUsername(username);

    if (!targetUser || !targetUser.isActive) {
      ctx.body = '';
      return;
    }

    const rssURL = `${config.host}/v2/timelines-rss/${urlEscape(targetUser.username)}`;
    const rssTitle = targetUser.isUser()
      ? `Posts of ${targetUser.username}`
      : `Posts in group ${targetUser.username}`;
    ctx.body = `<link rel="alternate" type="application/rss+xml" title="${_.escape(
      rssTitle,
    )}" href="${_.escape(rssURL)}" data-react-helmet="true">`;
  },
]);

/**
 * Fetch common timelines parameters from the request
 *
 * @param {object} ctx                                - request context object
 * @param {string} [ctx.request.query.limit]          - Number of posts returned (default: 30)
 * @param {string} [ctx.request.query.offset]         - Number of posts to skip (default: 0)
 * @param {string} [ctx.request.query.sort]           - Sort mode ('created' or 'updated')
 * @param {string} [ctx.request.query.with-my-posts]  - For filter/discussions only: return viewer's own
 *                                                      posts even without his likes or comments (default: no)
 * @param {string} [ctx.request.query.homefeed-mode]  - For RiverOfNews only: homefeed selection mode
 * @param {string} [ctx.request.query.created-before] - Show only posts created before this datetime (ISO 8601)
 * @param {string} [ctx.request.query.created-after]  - Show only posts created after this datetime (ISO 8601)
 * @param {string} defaultSort                        - Default sort mode
 * @return {object}                                   - Object with the following sructure:
 *                                                      { limit:number, offset:number, sort:string, withMyPosts:boolean }
 */
function getCommonParams(ctx, defaultSort = ORD_UPDATED) {
  const { query } = ctx.request;

  let limit = parseInt(query.limit, 10);

  if (isNaN(limit) || limit < 0 || limit > 120) {
    limit = 30;
  }

  let offset = parseInt(query.offset, 10);

  if (isNaN(offset) || offset < 0) {
    offset = 0;
  }

  let createdBefore = new Date(query['created-before']);

  if (isNaN(createdBefore)) {
    createdBefore = null;
  }

  let createdAfter = new Date(query['created-after']);

  if (isNaN(createdAfter)) {
    createdAfter = null;
  }

  const withMyPosts = ['yes', 'true', '1', 'on'].includes(
    (query['with-my-posts'] || '').toLowerCase(),
  );
  const sort = query.sort === ORD_CREATED || query.sort === ORD_UPDATED ? query.sort : defaultSort;
  const homefeedMode = [
    HOMEFEED_MODE_FRIENDS_ONLY,
    HOMEFEED_MODE_CLASSIC,
    HOMEFEED_MODE_FRIENDS_ALL_ACTIVITY,
  ].includes(query['homefeed-mode'])
    ? query['homefeed-mode']
    : HOMEFEED_MODE_CLASSIC;
  return { limit, offset, sort, homefeedMode, withMyPosts, createdBefore, createdAfter };
}

async function genericTimeline(dbAdapter, timeline = null, viewerId = null, params = {}) {
  params = {
    limit: 30,
    offset: 0,
    sort: ORD_UPDATED,
    homefeedMode: HOMEFEED_MODE_CLASSIC,
    withLocalBumps: false, // consider viewer local bumps (for RiverOfNews)
    withoutDirects: false, // do not show direct messages (for Likes and Comments)
    withMyPosts: false, // show viewer's own posts even without his likes or comments (for MyDiscussions)
    createdBefore: null,
    createdAfter: null,
    ...params,
  };

  params.withLocalBumps = params.withLocalBumps && !!viewerId && params.sort === ORD_UPDATED;
  params.withMyPosts = params.withMyPosts && timeline && timeline.name === 'MyDiscussions';

  const timelineIds = timeline ? [timeline.intId] : null;
  const activityFeedIds = [];
  const activityHideIds = [];
  const authorsIds = [];
  let activityOnPropagable = true;

  if (params.withMyPosts) {
    authorsIds.push(viewerId);
  }

  if (timeline) {
    const owner = await timeline.getUser();

    if (timeline.name === 'MyDiscussions') {
      const srcIds = await Promise.all([
        owner.getCommentsTimelineIntId(),
        owner.getLikesTimelineIntId(),
      ]);
      timelineIds.length = 0;
      timelineIds.push(...srcIds);
    } else if (timeline.name === 'RiverOfNews') {
      const { destinations, activities } = await dbAdapter.getSubscriprionsIntIds(timeline);
      timelineIds.length = 0;
      timelineIds.push(...destinations);

      if (!timeline.isInherent) {
        params.homefeedMode = HOMEFEED_MODE_FRIENDS_ONLY;
      }

      if (params.homefeedMode === HOMEFEED_MODE_FRIENDS_ALL_ACTIVITY) {
        activityOnPropagable = false;
        const friendsIds = await dbAdapter.getHomeFeedSubscriptions(timeline.id);
        authorsIds.push(...friendsIds);

        if (!authorsIds.includes(viewerId)) {
          authorsIds.push(viewerId);
        }
      }

      if (params.homefeedMode !== HOMEFEED_MODE_FRIENDS_ONLY) {
        const hideIntIds = await dbAdapter.getHomeFeedHideListPostIntIds(timeline);
        activityHideIds.push(...hideIntIds);
        activityFeedIds.push(...activities);
      }
    }
  }

  const postsIds =
    !timeline || (await timeline.canShow(viewerId))
      ? await dbAdapter.getTimelinePostsIds(timelineIds, viewerId, {
          ...params,
          authorsIds,
          activityFeedIds,
          activityOnPropagable,
          activityHideIds,
          limit: params.limit + 1,
        })
      : [];

  const isLastPage = postsIds.length <= params.limit;

  if (!isLastPage) {
    postsIds.length = params.limit;
  }

  return await serializeFeed(postsIds, viewerId, timeline, { isLastPage });
}
