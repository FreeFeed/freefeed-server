import monitor from 'monitor-dog';
import _ from 'lodash';
import { dbAdapter } from '../../../models';
import { serializePostsCollection, serializePost, serializeComment, serializeAttachment } from '../../../serializers/v2/post';
import { serializeUser } from '../../../serializers/v2/user';

const ORD_UPDATED = 'updated'; // eslint-disable-line no-unused-vars
const ORD_CREATED = 'created'; // eslint-disable-line no-unused-vars

export default class TimelinesController {
  app = null;

  constructor(app) {
    this.app = app;
  }

  bestOf = monitored('timelines.bestof-time', async (ctx) => {
    const DEFAULT_LIMIT = 30;

    const currentUserId = ctx.state.user ? ctx.state.user.id : null;
    const offset = parseInt(ctx.request.query.offset, 10) || 0;
    const limit =  parseInt(ctx.request.query.limit, 10) || DEFAULT_LIMIT;

    const foundPosts = await dbAdapter.bestPosts(ctx.state.user, offset, limit);
    const postsObjects = dbAdapter.initRawPosts(foundPosts, { currentUser: currentUserId });
    const postsCollectionJson = await serializePostsCollection(postsObjects);

    ctx.body = postsCollectionJson;
  });

  home = monitored('timelines.home-v2-time', async (ctx) => {
    const user = ctx.state.user;
    if (!user) {
      ctx.status = 401;
      ctx.body = { err: 'Unauthorized' };
      return;
    }
    const timeline = await dbAdapter.getUserNamedFeed(user.id, 'RiverOfNews');
    ctx.body = await genericTimeline(timeline, user.id, {
      withHides:      true,
      withLocalBumps: true,
      ...limitOffsetSort(ctx.request.query),
    });
  });
}

function monitored(monitorName, handlerFunc) {
  return async (ctx) => {
    const timer = monitor.timer(monitorName)
    try {
      await handlerFunc(ctx);
      monitor.increment(monitorName)
    } finally {
      timer.stop()
    }
  };
}

function limitOffsetSort(query, defaultSort = ORD_UPDATED) {
  let limit = parseInt(query.limit, 10);
  if (isNaN(limit) || limit < 0 || limit > 120) {
    limit = 30;
  }
  let offset = parseInt(query.offset, 10);
  if (isNaN(offset) || offset < 0) {
    offset = 0;
  }
  const sort = (query.sort === ORD_CREATED || query.sort === ORD_UPDATED) ? query.sort : defaultSort;
  return { limit, offset, sort };
}

async function genericTimeline(timeline, viewerId = null, params = {}) {
  params = {
    limit:          30,
    offset:         0,
    sort:           ORD_UPDATED,
    withHides:      false,
    withLocalBumps: false,
    ...params,
  };

  params.withLocalBumps = params.withLocalBumps && !!viewerId && params.sort === ORD_UPDATED;
  params.withHides = params.withHides && !!viewerId;

  const allUserIds = new Set();
  const allPosts = [];
  const allComments = [];
  const allAttachments = [];
  const allDestinations = [];
  const allSubscribers = [];

  const [
    bannedFeedsIds,
    { intId: hidesFeedId },
  ] = await Promise.all([
    viewerId ? dbAdapter.getBannedFeedsIntIds(viewerId) : [],
    params.withHides ? dbAdapter.getUserNamedFeed(viewerId, 'Hides') : { intId: 0 },
  ]);

  const postsIds = await dbAdapter.getTimelinePostsIds(timeline.intId, bannedFeedsIds, { ...params, viewerId });
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
  timelines.subscribers = await dbAdapter.getTimelineSubscribersIds(timeline.id);
  allUserIds.add(timeline.userId);
  allSubscribers.push(timeline.userId);

  allUserIds.add(...timelines.subscribers);
  allSubscribers.push(...timelines.subscribers);

  const [
    allUsersAssoc,
    allStatsAssoc,
  ] = await Promise.all([
    dbAdapter.getUsersByIdsAssoc([...allUserIds]),
    dbAdapter.getUsersStatsAssoc([...allUserIds]),
  ]);

  const uniqSubscribers = _.compact(_.uniq(allSubscribers));
  const groupIds = uniqSubscribers.filter((id) => allUsersAssoc[id].type === 'group');
  const allGroupAdmins = await dbAdapter.getGroupsAdministratorsIds(groupIds);

  const fillUser = getUserFiller(allUsersAssoc, allStatsAssoc, allGroupAdmins);

  const users = Object.keys(allUsersAssoc).map(fillUser).filter((u) => u.type === 'user');
  const subscribers = uniqSubscribers.map(fillUser);

  const subscriptions = _.uniqBy(_.compact(allDestinations), 'id');

  return {
    timelines,
    users,
    subscriptions,
    subscribers,
    posts:       allPosts,
    comments:    _.compact(allComments),
    attachments: _.compact(allAttachments),
  };
}

const defaultStats = {
  posts:         '0',
  likes:         '0',
  comments:      '0',
  subscribers:   '0',
  subscriptions: '0',
};

function getUserFiller(allUsers, allStats, allGroupAdmins = {}) {
  return (id) => {
    const obj = serializeUser(allUsers[id]);
    obj.statistics = allStats[id] || defaultStats;
    if (obj.type === 'group') {
      if (!obj.isVisibleToAnonymous) {
        obj.isVisibleToAnonymous = (obj.isProtected === '1') ? '0' : '1';
      }
      obj.administrators = allGroupAdmins[obj.id] || [];
    }
    return obj;
  };
}
