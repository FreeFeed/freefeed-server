import _ from 'lodash';
import { dbAdapter } from '../../../models';
import { load as configLoader } from '../../../../config/config';
import { serializePostsCollection, serializePost, serializeComment, serializeAttachment } from '../../../serializers/v2/post';
import { monitored, authRequired, userSerializerFunction } from './helpers';

const ORD_UPDATED = 'bumped'; // eslint-disable-line no-unused-vars
const ORD_CREATED = 'created'; // eslint-disable-line no-unused-vars

const config = configLoader();

export default class TimelinesController {
  app = null;

  constructor(app) {
    this.app = app;
  }

  bestOf = monitored('timelines.bestof', async (ctx) => {
    const DEFAULT_LIMIT = 30;

    const currentUserId = ctx.state.user ? ctx.state.user.id : null;
    const offset = parseInt(ctx.request.query.offset, 10) || 0;
    const limit =  parseInt(ctx.request.query.limit, 10) || DEFAULT_LIMIT;

    const foundPosts = await dbAdapter.bestPosts(ctx.state.user, offset, limit + 1);
    const isLastPage = foundPosts.length <= limit;
    if (!isLastPage) {
      foundPosts.length = limit;
    }
    const postsObjects = dbAdapter.initRawPosts(foundPosts, { currentUser: currentUserId });
    const postsCollectionJson = await serializePostsCollection(postsObjects, currentUserId);

    ctx.body = { ...postsCollectionJson, isLastPage };
  });

  home = authRequired(monitored('timelines.home-v2', async (ctx) => {
    const { user } = ctx.state;
    const timeline = await dbAdapter.getUserNamedFeed(user.id, 'RiverOfNews');
    ctx.body = await genericTimeline(timeline, user.id, {
      withLocalBumps: true,
      ...getCommonParams(ctx),
    });
  }));

  myDiscussions = authRequired(monitored('timelines.my_discussions-v2', async (ctx) => {
    const { user } = ctx.state;
    const timeline = await dbAdapter.getUserNamedFeed(user.id, 'MyDiscussions');
    ctx.body = await genericTimeline(timeline, user.id, getCommonParams(ctx));
  }));

  directs = authRequired(monitored('timelines.directs-v2', async (ctx) => {
    const { user } = ctx.state;
    const timeline = await dbAdapter.getUserNamedFeed(user.id, 'Directs');
    ctx.body = await genericTimeline(timeline, user.id, getCommonParams(ctx));
  }));

  userTimeline = (feedName) => monitored(`timelines.${feedName.toLowerCase()}-v2`, async (ctx) => {
    const { username } = ctx.params;
    const user = await dbAdapter.getFeedOwnerByUsername(username)
    if (!user || user.hashedPassword === '') {
      ctx.status = 404;
      ctx.body = { err: `User "${username}" is not found` };
      return;
    }
    const viewer = ctx.state.user || null;
    const timeline = await dbAdapter.getUserNamedFeed(user.id, feedName);
    ctx.body = await genericTimeline(timeline, viewer ? viewer.id : null, {
      withoutDirects: (feedName !== 'Posts'),
      ...getCommonParams(ctx),
    });
  });
}

/**
 * Fetch common timelines parameters from the request
 *
 * @param {object} ctx                                - request context object
 * @param {string} [ctx.request.query.limit]          - Number of posts returned (default: 30)
 * @param {string} [ctx.request.query.offset]         - Number of posts to skip (default: 0)
 * @param {string} [ctx.request.query.sort]           - Sort mode ('created' or 'updated')
 * @param {string} [ctx.request.query.with-my-posts]  - For filter/discussions only: return viewer's own
 *                                                      posts even without his likes or comments (default: no)
 * @param {string} [ctx.request.query.created-before] - Show only posts created before this datetime (ISO 8601)
 * @param {string} [ctx.request.query.created-after]  - Show only posts created after this datetime (ISO 8601)
 * @param {string} defaultSort                        - Default sort mode
 * @return {object}                                   - Object with the following sructure:
 *                                                      { limit:number, offset:number, sort:string, withMyPosts:boolean, hiddenCommentTypes: array }
 */
function getCommonParams(ctx, defaultSort = ORD_UPDATED) {
  const { query } = ctx.request;
  const viewer = ctx.state.user;

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
  const withMyPosts = ['yes', 'true', '1', 'on'].includes((query['with-my-posts'] || '').toLowerCase());
  const sort = (query.sort === ORD_CREATED || query.sort === ORD_UPDATED) ? query.sort : defaultSort;
  const hiddenCommentTypes = viewer ? viewer.getHiddenCommentTypes() : [];
  return { limit, offset, sort, withMyPosts, hiddenCommentTypes, createdBefore, createdAfter };
}

async function genericTimeline(timeline, viewerId = null, params = {}) {
  params = {
    limit:              30,
    offset:             0,
    sort:               ORD_UPDATED,
    withLocalBumps:     false,  // consider viewer local bumps (for RiverOfNews)
    withoutDirects:     false,  // do not show direct messages (for Likes and Comments)
    withMyPosts:        false,  // show viewer's own posts even without his likes or comments (for MyDiscussions)
    hiddenCommentTypes: [],     // dont show hidden/deleted comments of these hide_type's
    createdBefore:      null,
    createdAfter:       null,
    ...params,
  };

  params.withLocalBumps = params.withLocalBumps && !!viewerId && params.sort === ORD_UPDATED;
  params.withMyPosts = params.withMyPosts && timeline.name === 'MyDiscussions';

  const allUserIds = new Set();
  const allPosts = [];
  const allComments = [];
  const allAttachments = [];
  const allDestinations = [];
  const allSubscribers = [];

  const { intId: hidesFeedId } = viewerId ? await dbAdapter.getUserNamedFeed(viewerId, 'Hides') : { intId: 0 };

  const timelineIds = [timeline.intId];
  const activityFeedIds = [];
  const owner = await timeline.getUser();
  let canViewUser = true;

  if (timeline.name === 'MyDiscussions') {
    const srcIds = await Promise.all([
      owner.getCommentsTimelineIntId(),
      owner.getLikesTimelineIntId(),
    ]);
    timelineIds.length = 0;
    timelineIds.push(...srcIds);
  } else if (['Posts', 'Comments', 'Likes'].includes(timeline.name)) {
    // Checking access rights for viewer
    if (!viewerId) {
      canViewUser = (owner.isProtected === '0');
    } else if (viewerId !== owner.id) {
      if (owner.isPrivate === '1') {
        const subscribers = await dbAdapter.getUserSubscribersIds(owner.id);
        canViewUser = subscribers.includes(viewerId);
      }
      if (canViewUser) {
        // Viewer cannot see feeds of users in ban relations with him
        const banIds = await dbAdapter.getBansAndBannersOfUser(viewerId);
        canViewUser = !banIds.includes(owner.id);
      }
    }
  } else if (timeline.name === 'RiverOfNews' && config.dynamicRiverOfNews) {
    const { destinations, activities } = await dbAdapter.getSubscriprionsIntIds(viewerId);
    timelineIds.length = 0;
    timelineIds.push(...destinations);
    activityFeedIds.push(...activities);
  }

  const postsIds = canViewUser ?
    await dbAdapter.getTimelinePostsIds(timeline.name, timelineIds, viewerId, { ...params, activityFeedIds, limit: params.limit + 1 }) :
    [];

  const isLastPage = postsIds.length <= params.limit;
  if (!isLastPage) {
    postsIds.length = params.limit;
  }

  const postsWithStuff = await dbAdapter.getPostsWithStuffByIds(postsIds, viewerId, params);

  for (const { post, destinations, attachments, comments, likes, omittedComments, omittedLikes } of postsWithStuff) {
    const sPost = {
      ...serializePost(post),
      postedTo:    destinations.map((d) => d.id),
      comments:    comments.map((c) => c.id),
      attachments: attachments.map((a) => a.id),
      likes,
      omittedComments,
      omittedLikes,
    };

    if (post.feedIntIds.includes(hidesFeedId)) {
      sPost.isHidden = true; // present only if true
    }

    allPosts.push(sPost);
    allDestinations.push(...destinations);
    allSubscribers.push(..._.map(destinations, 'user'));
    allComments.push(...comments.map(serializeComment));
    allAttachments.push(...attachments.map(serializeAttachment));

    allUserIds.add(sPost.createdBy);
    likes.forEach((l) => allUserIds.add(l));
    comments.forEach((c) => allUserIds.add(c.userId));
    destinations.forEach((d) => allUserIds.add(d.user));
  }

  const timelines = _.pick(timeline, ['id', 'name']);
  timelines.user = timeline.userId;
  timelines.posts = postsIds;
  timelines.subscribers = canViewUser ? await dbAdapter.getTimelineSubscribersIds(timeline.id) : [];
  allSubscribers.push(timeline.userId);
  allSubscribers.push(...timelines.subscribers);
  allSubscribers.forEach((s) => allUserIds.add(s));

  const allGroupAdmins = canViewUser ? await dbAdapter.getGroupsAdministratorsIds([...allUserIds]) : {};
  _.values(allGroupAdmins).forEach((ids) => ids.forEach((s) => allUserIds.add(s)));

  const [
    allUsersAssoc,
    allStatsAssoc,
  ] = await Promise.all([
    dbAdapter.getUsersByIdsAssoc([...allUserIds]),
    dbAdapter.getUsersStatsAssoc([...allUserIds]),
  ]);

  const uniqSubscribers = _.compact(_.uniq(allSubscribers));

  const serializeUser = userSerializerFunction(allUsersAssoc, allStatsAssoc, allGroupAdmins);

  const users = Object.keys(allUsersAssoc).map(serializeUser).filter((u) => u.type === 'user' || u.id === timeline.userId);
  const subscribers = canViewUser ? uniqSubscribers.map(serializeUser) : [];

  const subscriptions = canViewUser ? _.uniqBy(_.compact(allDestinations), 'id') : [];

  const admins = canViewUser ? (allGroupAdmins[timeline.userId] || []).map(serializeUser) : [];

  return {
    timelines,
    users,
    subscriptions,
    subscribers,
    admins,
    isLastPage,
    posts:       allPosts,
    comments:    _.compact(allComments),
    attachments: _.compact(allAttachments),
  };
}
