import _ from 'lodash'
import { dbAdapter } from '../../../models';
import { ALLOWED_EVENT_TYPES } from '../../../support/EventService'
import { userSerializerFunction } from './helpers'

const EVENT_GROUPS = {
  mentions:      ['mention_in_post', 'mention_in_comment', 'mention_comment_to'],
  bans:          ['banned_user', 'unbanned_user'],
  subscriptions: [
    'user_subscribed',
    'user_unsubscribed',
    'subscription_requested',
    'subscription_request_revoked',
    'subscription_request_approved',
    'subscription_request_rejected',
  ],
  groups: [
    'group_created',
    'group_subscribed',
    'group_unsubscribed',
    'group_subscription_requested',
    'group_subscription_request_revoked',
    'group_subscription_approved',
    'managed_group_subscription_approved',
    'group_subscription_rejected',
    'managed_group_subscription_rejected',
    'group_admin_promoted',
    'group_admin_demoted',
  ],
  directs: ['direct', 'direct_comment']
};
const DEFAULT_EVENTS_LIMIT = 30;

export default class EventsController {
  static async myEvents(ctx) {
    if (!ctx.state.user) {
      ctx.status = 403;
      ctx.body = { err: 'Unauthorized' };
      return;
    }

    const params = getQueryParams(ctx);
    const events = await dbAdapter.getUserEvents(
      ctx.state.user.intId,
      params.eventTypes,
      params.limit + 1,
      params.offset,
      params.startDate,
      params.endDate
    );

    const isLastPage = events.length <= params.limit;
    if (!isLastPage) {
      events.length = params.limit;
    }

    const serializedData = await serializeEvents(events);

    ctx.body = {
      Notifications: serializedData.events,
      users:         serializedData.users,
      groups:        serializedData.groups,
      isLastPage
    };
  }
}

function getQueryParams(ctx) {
  const offset = parseInt(ctx.request.query.offset, 10) || 0;
  const limit =  parseInt(ctx.request.query.limit, 10) || DEFAULT_EVENTS_LIMIT;
  let eventGroups = ctx.request.query.filter || [];
  if (!_.isArray(eventGroups)) {
    eventGroups = [eventGroups];
  }
  let eventTypes = [];
  if (eventGroups.length === 0) {
    eventTypes = ALLOWED_EVENT_TYPES.slice();
  } else {
    for (const g of eventGroups) {
      const mapping = EVENT_GROUPS[g];
      if (mapping) {
        eventTypes.push(...mapping);
      }
    }
  }

  eventTypes = _(eventTypes).intersection(ALLOWED_EVENT_TYPES).uniq().value();
  if (eventTypes.length === 0) {
    eventTypes = null;
  }

  const startDate = ctx.request.query.startDate ? new Date(ctx.request.query.startDate) : null;
  const endDate = ctx.request.query.endDate ? new Date(ctx.request.query.endDate) : null;
  return {
    offset,
    limit,
    eventTypes,
    startDate,
    endDate
  };
}

async function serializeEvents(events) {
  const [userIdsMapping, postIdsMapping, commentIdsMapping] = await getIntIdsMappings(events);

  const serializedEvents = events.map((e) => {
    return {
      id:               e.id,
      eventId:          e.uid,
      date:             e.created_at.toISOString(),
      created_user_id:  userIdsMapping[e.created_by_user_id] || null,
      affected_user_id: userIdsMapping[e.target_user_id] || null,
      event_type:       e.event_type,
      group_id:         userIdsMapping[e.group_id] || null,
      post_id:          postIdsMapping[e.post_id] || null,
      comment_id:       commentIdsMapping[e.comment_id] || null,
      post_author_id:   userIdsMapping[e.post_author_id] || null
    };
  });

  const allUserIds = new Set();
  _.values(userIdsMapping).forEach((id) => allUserIds.add(id));
  const allGroupAdmins = await dbAdapter.getGroupsAdministratorsIds([...allUserIds]);
  _.values(allGroupAdmins).forEach((ids) => ids.forEach((s) => allUserIds.add(s)));

  const [allUsersAssoc, allStatsAssoc] = await Promise.all([
    dbAdapter.getUsersByIdsAssoc([...allUserIds]),
    dbAdapter.getUsersStatsAssoc([...allUserIds]),
  ]);

  const serializeUser = userSerializerFunction(allUsersAssoc, allStatsAssoc, allGroupAdmins);
  const users = Object.keys(allUsersAssoc).map(serializeUser).filter((u) => u.type === 'user');
  const groups = Object.keys(allUsersAssoc).map(serializeUser).filter((u) => u.type === 'group');

  return {
    events: serializedEvents,
    users,
    groups
  };
}

async function getIntIdsMappings(events) {
  let usersIntIds = [];
  let postsIntIds = [];
  let commentsIntIds = [];
  for (const e of events) {
    usersIntIds.push(e.user_id, e.created_by_user_id, e.target_user_id, e.group_id, e.post_author_id);
    postsIntIds.push(e.post_id);
    commentsIntIds.push(e.comment_id);
  }
  usersIntIds = _(usersIntIds).compact().uniq().value();
  postsIntIds = _(postsIntIds).compact().uniq().value();
  commentsIntIds = _(commentsIntIds).compact().uniq().value();

  const [userIds, postIds, commentIds] = await Promise.all([
    dbAdapter.getUsersIdsByIntIds(usersIntIds),
    dbAdapter.getPostsIdsByIntIds(postsIntIds),
    dbAdapter.getCommentsIdsByIntIds(commentsIntIds)
  ]);
  const userIdsMapping = {};
  const postIdsMapping = {};
  const commentIdsMapping = {};
  for (const el of userIds) {
    userIdsMapping[el.id] = el.uid;
  }
  for (const el of postIds) {
    postIdsMapping[el.id] = el.uid;
  }
  for (const el of commentIds) {
    commentIdsMapping[el.id] = el.uid;
  }
  return [userIdsMapping, postIdsMapping, commentIdsMapping];
}
