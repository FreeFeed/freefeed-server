import moment from 'moment';
import { dbAdapter } from '../models';
import { serializeEvents } from '../serializers/v2/event';
import { sendEventsDigestEmail } from '../mailers/NotificationDigestMailer';
import { COUNTABLE_EVENT_TYPES } from './EventTypes';


export async function sendEmails() {
  const users = await dbAdapter.getNotificationsDigestRecipients();
  const emailsSentAt = await dbAdapter.getDigestSentAt(users.map((u) => u.intId));

  const promises = users.map(async (u) => {
    const notificationsLastSeenAt = u.notificationsReadAt ? u.notificationsReadAt : null;
    const digestSentAt = emailsSentAt[u.intId];
    const notificationsQueryDate = getUnreadEventsIntervalStart(digestSentAt, notificationsLastSeenAt);

    if (!notificationsQueryDate) {
      return;
    }

    let digestInterval = `${notificationsQueryDate.format('MMM Do YYYY')} - ${moment().format('MMM Do YYYY')}`;
    if (notificationsQueryDate.isSameOrAfter(moment().subtract(1, 'days'), 'hours')) {
      digestInterval = notificationsQueryDate.format('MMM Do YYYY');
    }

    const events = await dbAdapter.getUserEvents(u.intId, COUNTABLE_EVENT_TYPES, null, null, notificationsQueryDate);
    if (!events.length) {
      return;
    }
    const serializedEvents = await serializeEvents(events);

    await sendEventsDigestEmail(u, serializedEvents.events, serializedEvents.users, serializedEvents.groups, digestInterval);
    await dbAdapter.addNotificationEmailLogEntry(u.intId, u.email);
  });
  await Promise.all(promises);
}

function getUnreadEventsIntervalStart(digestSentAt, notificationsLastSeenAt) {
  digestSentAt = digestSentAt ? moment(digestSentAt) : null;
  notificationsLastSeenAt = notificationsLastSeenAt ? moment(notificationsLastSeenAt) : null;
  const _90DaysAgo = moment().subtract(90, 'days'),
    DayAgo = moment().subtract(1, 'days'),
    DayAgoAndHalfAnHour = moment().subtract(1, 'days').subtract(30, 'minutes');

  if (!digestSentAt) {
    if (!notificationsLastSeenAt) {
      return _90DaysAgo;
    }
    if (notificationsLastSeenAt.isSameOrBefore(DayAgo, 'minute')) {
      return notificationsLastSeenAt;
    }
    return notificationsLastSeenAt;
  }
  if (digestSentAt.isAfter(DayAgo)) {
    return null;
  }
  if (digestSentAt.isBefore(DayAgo) && digestSentAt.isSameOrAfter(DayAgoAndHalfAnHour, 'minute')) {
    if (!notificationsLastSeenAt) {
      return DayAgo;
    }
    if (notificationsLastSeenAt.isAfter(DayAgo)) {
      return notificationsLastSeenAt;
    }
    return DayAgo;
  }
  if (!notificationsLastSeenAt) {
    return digestSentAt;
  }
  if (notificationsLastSeenAt.isAfter(DayAgo)) {
    return notificationsLastSeenAt;
  }
  return digestSentAt;
}
