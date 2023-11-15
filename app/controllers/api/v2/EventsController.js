import _ from 'lodash';
import compose from 'koa-compose';

import { dbAdapter } from '../../../models';
import { ALLOWED_EVENT_TYPES, EVENT_TYPES as ET } from '../../../support/EventTypes';
import { serializeEvents } from '../../../serializers/v2/event';
import { authRequired } from '../../middlewares';
import { NotFoundException } from '../../../support/exceptions';

const EVENT_GROUPS = {
  mentions: [ET.MENTION_IN_POST, ET.MENTION_IN_COMMENT, ET.MENTION_COMMENT_TO],
  comments: [
    ET.POST_COMMENT,
    ET.DIRECT_COMMENT_CREATED,
    ET.MENTION_IN_COMMENT,
    ET.MENTION_COMMENT_TO,
  ],
  bans: [ET.USER_BANNED, ET.USER_UNBANNED, ET.BANS_IN_GROUP_DISABLED, ET.BANS_IN_GROUP_ENABLED],
  subscriptions: [
    ET.USER_SUBSCRIBED,
    ET.SUBSCRIPTION_REQUESTED,
    ET.SUBSCRIPTION_REQUEST_REVOKED,
    ET.SUBSCRIPTION_REQUEST_APPROVED,
    ET.SUBSCRIPTION_REQUEST_REJECTED,
  ],
  groups: [
    ET.GROUP_CREATED,
    ET.GROUP_SUBSCRIBED,
    ET.GROUP_UNSUBSCRIBED,
    ET.GROUP_SUBSCRIPTION_REQUEST,
    ET.GROUP_REQUEST_REVOKED,
    ET.GROUP_SUBSCRIPTION_APPROVED,
    ET.MANAGED_GROUP_SUBSCRIPTION_APPROVED,
    ET.GROUP_SUBSCRIPTION_REJECTED,
    ET.MANAGED_GROUP_SUBSCRIPTION_REJECTED,
    ET.GROUP_ADMIN_PROMOTED,
    ET.GROUP_ADMIN_DEMOTED,
  ],
  directs: [ET.DIRECT_CREATED, ET.DIRECT_COMMENT_CREATED],
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
      params.endDate,
    );

    const isLastPage = events.length <= params.limit;

    if (!isLastPage) {
      events.length = params.limit;
    }

    const serializedData = await serializeEvents(events, ctx.state.user.id);

    ctx.body = {
      Notifications: serializedData.events,
      users: serializedData.users,
      groups: serializedData.groups,
      isLastPage,
    };
  }

  static eventById = compose([
    authRequired(),
    async (ctx) => {
      const { user } = ctx.state;
      const { notifId: eventId } = ctx.params;

      const event = await dbAdapter.getEventById(eventId);

      if (event?.user_id !== user.intId) {
        throw new NotFoundException('Notification not found');
      }

      const { events, users, groups } = await serializeEvents([event], user.id);
      ctx.body = {
        Notifications: events,
        users,
        groups,
      };
    },
  ]);
}

function getQueryParams(ctx) {
  const offset = parseInt(ctx.request.query.offset, 10) || 0;
  const limit = parseInt(ctx.request.query.limit, 10) || DEFAULT_EVENTS_LIMIT;
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
    endDate,
  };
}
