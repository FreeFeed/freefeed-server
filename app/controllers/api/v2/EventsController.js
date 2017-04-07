import _ from 'lodash'
import { dbAdapter } from '../../../models';
import { EVENT_TYPES } from '../../../support/EventService'

const FORBIDDEN_EVENT_TYPES = ['banned_by_user', 'unbanned_by_user'];
const ALLOWED_EVENT_TYPES = _.difference(_.values(EVENT_TYPES), FORBIDDEN_EVENT_TYPES);
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

    const serializedEvents = await serializeEvents(events);

    ctx.body = { Notifications: serializedEvents, isLastPage };
  }
}

function getQueryParams(ctx) {
  const offset = parseInt(ctx.request.query.offset, 10) || 0;
  const limit =  parseInt(ctx.request.query.limit, 10) || DEFAULT_EVENTS_LIMIT;
  let eventTypes = _(ctx.request.query.filter || ALLOWED_EVENT_TYPES).intersection(ALLOWED_EVENT_TYPES).uniq().value();
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
      eventId:          null,
      date:             e.created_at.toISOString(),
      created_user_id:  userIdsMapping[e.created_by_user_id] || null,
      affected_user_id: userIdsMapping[e.target_user_id] || null,
      event_type:       e.event_type,
      group_id:         userIdsMapping[e.group_id] || null,
      post_id:          postIdsMapping[e.post_id] || null,
      comment_id:       commentIdsMapping[e.comment_id] || null
    };
  });

  return serializedEvents;
}

async function getIntIdsMappings(events) {
  let usersIntIds = [];
  let postsIntIds = [];
  let commentsIntIds = [];
  for (const e of events) {
    usersIntIds.push(e.user_id, e.created_by_user_id, e.target_user_id, e.group_id);
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
