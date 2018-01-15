import moment from 'moment';
import createDebug from 'debug';

import { dbAdapter } from '../models';
import { serializeEvents } from '../serializers/v2/event';
import { sendEventsDigestEmail } from '../mailers/NotificationDigestMailer';
import { COUNTABLE_EVENT_TYPES } from './EventTypes';


export async function sendEmails() {
  const debug = createDebug('freefeed:sendEmails');

  const users = await dbAdapter.getNotificationsDigestRecipients();
  debug(`getNotificationsDigestRecipients() returned ${users.length} records`);

  const emailsSentAt = await dbAdapter.getDigestSentAt(users.map((u) => u.intId));

  const promises = users.map(async (u) => {
    const notificationsLastSeenAt = u.notificationsReadAt ? u.notificationsReadAt : null;
    const digestSentAt = emailsSentAt[u.intId];
    const notificationsQueryDate = getUnreadEventsIntervalStart(digestSentAt, notificationsLastSeenAt);

    if (!notificationsQueryDate) {
      debug(`[${u.username}] getUnreadEventsIntervalStart() returned falsy value: SKIP`);
      return;
    }

    let digestInterval = `${notificationsQueryDate.format('MMM Do YYYY')} - ${moment().format('MMM Do YYYY')}`;
    if (notificationsQueryDate.isSameOrAfter(moment().subtract(1, 'days'), 'hours')) {
      digestInterval = notificationsQueryDate.format('MMM Do YYYY');
    }

    debug(`[${u.username}] looking for notifications since ${digestInterval}…`);

    const events = await dbAdapter.getUserEvents(u.intId, COUNTABLE_EVENT_TYPES, null, null, notificationsQueryDate);
    if (!events.length) {
      debug(`[${u.username}] no relevant notifications found: SKIP`);
      return;
    }

    debug(`[${u.username}] found ${events.length} notifications`);

    const serializedEvents = await serializeEvents(events);
    await sendEventsDigestEmail(u, serializedEvents.events, serializedEvents.users, serializedEvents.groups, digestInterval);
    debug(`[${u.username}] email is queued: OK`);

    await dbAdapter.addNotificationEmailLogEntry(u.intId, u.email);
    debug(`[${u.username}] added entry to notification_email_log`);
  });

  debug('waiting for all promised actions to finish');
  await Promise.all(promises);
  debug('all promised actions are finished');
}

function getUnreadEventsIntervalStart(digestSentAt, notificationsLastSeenAt) {
  const wrappedDigestSentAt = digestSentAt ? moment(digestSentAt) : null;
  const wrappedNotificationsLastSeenAt = notificationsLastSeenAt ? moment(notificationsLastSeenAt) : null;

  const _90DaysAgo = moment().subtract(90, 'days');
  const DayAgo = moment().subtract(1, 'days');
  const DayAgoAndHalfAnHour = moment().subtract(1, 'days').subtract(30, 'minutes');

  if (!wrappedDigestSentAt) {
    if (!wrappedNotificationsLastSeenAt) {
      return _90DaysAgo;
    }

    if (wrappedNotificationsLastSeenAt.isSameOrBefore(DayAgo, 'minute')) {
      return wrappedNotificationsLastSeenAt;
    }

    return wrappedNotificationsLastSeenAt;
  }

  if (wrappedDigestSentAt.isAfter(DayAgo)) {
    return null;
  }

  if (wrappedDigestSentAt.isBefore(DayAgo) && wrappedDigestSentAt.isSameOrAfter(DayAgoAndHalfAnHour, 'minute')) {
    if (!wrappedNotificationsLastSeenAt) {
      return DayAgo;
    }

    if (wrappedNotificationsLastSeenAt.isAfter(DayAgo)) {
      return wrappedNotificationsLastSeenAt;
    }

    return DayAgo;
  }

  if (!wrappedNotificationsLastSeenAt) {
    return wrappedDigestSentAt;
  }

  if (wrappedNotificationsLastSeenAt.isAfter(DayAgo)) {
    return wrappedNotificationsLastSeenAt;
  }

  return wrappedDigestSentAt;
}
