import _ from 'lodash';
import { dbAdapter } from '../../../models';
import { ALLOWED_EVENT_TYPES } from '../../../support/EventTypes';
import { serializeEvents } from '../../../serializers/v2/event';


const EVENT_GROUPS = {
  mentions:      ['mention_in_post', 'mention_in_comment', 'mention_comment_to'],
  bans:          ['banned_user', 'unbanned_user'],
  subscriptions: [
    'user_subscribed',
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

    const serializedData = await serializeEvents(events, ctx.state.user.id);

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
