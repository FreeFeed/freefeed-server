import moment from 'moment';
import createDebug from 'debug';

import { dbAdapter } from '../models';
import { serializeEvents } from '../serializers/v2/event';
import { sendEventsDigestEmail } from '../mailers/NotificationDigestMailer';
import { DIGEST_EVENT_TYPES } from './EventTypes';


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

    const events = await dbAdapter.getUserEvents(u.intId, DIGEST_EVENT_TYPES, null, null, notificationsQueryDate);

    if (!events.length) {
      debug(`[${u.username}] no relevant notifications found: SKIP`);
      return;
    }

    debug(`[${u.username}] found ${events.length} notifications`);

    const serializedEvents = await serializeEvents(events, u.id);
    await sendEventsDigestEmail(u, serializedEvents.events, serializedEvents.users, serializedEvents.groups, digestInterval);
    debug(`[${u.username}] email is queued: OK`);

    await dbAdapter.addSentEmailLogEntry(u.intId, u.email, 'notification');
    debug(`[${u.username}] added entry to sent_emails_log`);
  });

  debug('waiting for all promised actions to finish');
  await Promise.all(promises);
  debug('all promised actions are finished');
}

export function getUnreadEventsIntervalStart(digestSentAt, notificationsLastSeenAt, now) {
  const wrappedDigestSentAt = digestSentAt ? moment(digestSentAt) : null;
  const wrappedNotificationsLastSeenAt = notificationsLastSeenAt ? moment(notificationsLastSeenAt) : null;
  const wrappedNow = moment(now);

  const _90DaysAgo = wrappedNow.clone().subtract(90, 'days');
  const DayAgoAndHalfAnHour = wrappedNow.clone().subtract(1, 'days').add(30, 'minutes');

  if (wrappedDigestSentAt && wrappedDigestSentAt.isAfter(DayAgoAndHalfAnHour)) {
    return null;
  }

  if (
    (!wrappedDigestSentAt || wrappedDigestSentAt.isBefore(_90DaysAgo)) &&
    (!wrappedNotificationsLastSeenAt || wrappedNotificationsLastSeenAt.isBefore(_90DaysAgo))
  ) {
    return _90DaysAgo;
  }

  if (wrappedDigestSentAt && (!wrappedNotificationsLastSeenAt || wrappedDigestSentAt.isAfter(wrappedNotificationsLastSeenAt))) {
    return wrappedDigestSentAt;
  }

  return wrappedNotificationsLastSeenAt;
}
