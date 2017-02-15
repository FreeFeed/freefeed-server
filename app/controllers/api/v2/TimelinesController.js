import _ from 'lodash';
import { dbAdapter } from '../../../models';
import { serializePostsCollection, serializePost, serializeComment, serializeAttachment } from '../../../serializers/v2/post';
import { monitored, authRequired, userSerializerFunction } from './helpers';

const ORD_UPDATED = 'updated'; // eslint-disable-line no-unused-vars
const ORD_CREATED = 'created'; // eslint-disable-line no-unused-vars

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
    const postsCollectionJson = await serializePostsCollection(postsObjects);

    ctx.body = { ...postsCollectionJson, isLastPage };
  });

  home = authRequired(monitored('timelines.home-v2', async (ctx) => {
    const user = ctx.state.user;
    const timeline = await dbAdapter.getUserNamedFeed(user.id, 'RiverOfNews');
    ctx.body = await genericTimeline(timeline, user.id, {
      withHides:      true,
      withLocalBumps: true,
      ...getQueryParams(ctx.request.query),
    });
  }));

  myDiscussions = authRequired(monitored('timelines.my_discussions-v2', async (ctx) => {
    const user = ctx.state.user;
    const timeline = await dbAdapter.getUserNamedFeed(user.id, 'MyDiscussions');
    ctx.body = await genericTimeline(timeline, user.id, { ...getQueryParams(ctx.request.query) });
  }));

  directs = authRequired(monitored('timelines.directs-v2', async (ctx) => {
    const user = ctx.state.user;
    const timeline = await dbAdapter.getUserNamedFeed(user.id, 'Directs');
    ctx.body = await genericTimeline(timeline, user.id, { ...getQueryParams(ctx.request.query) });
  }));

  userTimeline = (feedName) => monitored(`timelines.${feedName.toLowerCase()}-v2`, async (ctx) => {
    const username = ctx.params.username
    const user = await dbAdapter.getFeedOwnerByUsername(username)
    if (!user || user.hashedPassword === '') {
      ctx.status = 404;
      ctx.body = { err: `User "${username}" is not found` };
      return;
    }
    const viewer = ctx.state.user || null;
    const timeline = await dbAdapter.getUserNamedFeed(user.id, feedName);
    ctx.body = await genericTimeline(timeline, viewer ? viewer.id : null, {
      sort:           (feedName === 'Posts' && user.type === 'user') ? ORD_CREATED : ORD_UPDATED,
      withoutDirects: (feedName !== 'Posts'),
      ...getQueryParams(ctx.request.query),
    });
  });
}

/**
 * Fetch parameters from the URL query object
 *
 * @param {object} query                 - Query object
 * @param {string} [query.limit]         - Number of posts returned (default: 30)
 * @param {string} [query.offset]        - Number of posts to skip (default: 0)
 * @param {string} [query.sort]          - Sort mode ('created' or 'updated')
 * @param {string} [query.with-my-posts] - For filter/discussions only: return viewer's own
 *                                         posts even without his likes or comments (default: no)
 * @param {string} defaultSort           - Default sort mode
 * @return {object}                      - Object with the following sructure:
 *                                         { limit:number, offset:number, sort:string, withMyPosts:boolean }
 */
function getQueryParams(query, defaultSort = ORD_UPDATED) {
  let limit = parseInt(query.limit, 10);
  if (isNaN(limit) || limit < 0 || limit > 120) {
    limit = 30;
  }
  let offset = parseInt(query.offset, 10);
  if (isNaN(offset) || offset < 0) {
    offset = 0;
  }
  const withMyPosts = ['yes', 'true', '1', 'on'].includes((query['with-my-posts'] || '').toLowerCase());
  const sort = (query.sort === ORD_CREATED || query.sort === ORD_UPDATED) ? query.sort : defaultSort;
  return { limit, offset, sort, withMyPosts };
}

async function genericTimeline(timeline, viewerId = null, params = {}) {
  params = {
    limit:          30,
    offset:         0,
    sort:           ORD_UPDATED,
    withHides:      false,  // consider viewer Hides feed (for RiverOfNews)
    withLocalBumps: false,  // consider viewer local bumps (for RiverOfNews)
    withoutDirects: false,  // do not show direct messages (for Likes and Comments)
    withMyPosts:    false,  // show viewer's own posts even without his likes or comments (for MyDiscussions)
    ...params,
  };

  params.withLocalBumps = params.withLocalBumps && !!viewerId && params.sort === ORD_UPDATED;
  params.withHides = params.withHides && !!viewerId;
  params.withMyPosts = params.withMyPosts && timeline.name === 'MyDiscussions';

  const allUserIds = new Set();
  const allPosts = [];
  const allComments = [];
  const allAttachments = [];
  const allDestinations = [];
  const allSubscribers = [];

  const { intId: hidesFeedId } = params.withHides ? await dbAdapter.getUserNamedFeed(viewerId, 'Hides') : { intId: 0 };

  const timelineIds = [timeline.intId];
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
  }

  const postsIds = canViewUser ?
    await dbAdapter.getTimelinePostsIds(timelineIds, viewerId, { ...params, limit: params.limit + 1 }) :
    [];

  const isLastPage = postsIds.length <= params.limit;
  if (!isLastPage) {
    postsIds.length = params.limit;
  }

  const postsWithStuff = await dbAdapter.getPostsWithStuffByIds(postsIds, viewerId);

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

    if (params.withHides && post.feedIntIds.includes(hidesFeedId)) {
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
