/* eslint-env node, mocha */
import unexpected from 'unexpected';
import unexpectedMoment from 'unexpected-moment';
import moment from 'moment';

import { getUnreadEventsIntervalStart } from '../../../app/support/NotificationsDigest';


const expect = unexpected.clone()
  .use(unexpectedMoment);

describe('NotificationsDigest', () => {
  describe('getUnreadEventsIntervalStart()', () => {
    const longTimeAgo1 = '2017-01-10T01:00:00.000Z';
    const longTimeAgo2 = '2017-01-11T01:00:00.000Z';
    const someTimeAgo1 = '2017-12-20T00:00:00.000Z';
    const someTimeAgo2 = '2017-12-21T00:00:00.000Z';
    const recently = '2018-01-01T00:00:00.000Z';

    const now = recently;
    const ninetyAgo = moment(now).subtract(90, 'days');

    describe('if never sent previously', () => {
      it('should not send items earlier than 90 days ago (if never saw)', async () => {
        await expect(getUnreadEventsIntervalStart(null, null, now), 'to be same or after', ninetyAgo);
      });

      it('should not send items earlier than 90 days ago (if saw something)', async () => {
        const seenAt = longTimeAgo1;

        await expect(getUnreadEventsIntervalStart(null, seenAt, now), 'to be same or after', ninetyAgo);
      });
    });

    describe('if sent long time ago', () => {
      it('should not send items earlier than 90 days ago', async () => {
        const sentAt = longTimeAgo1;

        await expect(getUnreadEventsIntervalStart(sentAt, null, now), 'to be same or after', ninetyAgo);
      });

      it('should not send items earlier than 90 days ago', async () => {
        const seenAt = longTimeAgo1;
        const sentAt = longTimeAgo2;

        await expect(getUnreadEventsIntervalStart(sentAt, seenAt, now), 'to be same or after', ninetyAgo);
      });
    });

    describe('if seen or sent less than 90 days ago', () => {
      it('should sent all unsent items (if never saw)', async () => {
        const sentAt = someTimeAgo1;

        await expect(getUnreadEventsIntervalStart(sentAt, null, now), 'to equal', moment(sentAt));
      });

      it('should send all unseen items (if never sent)', async () => {
        const seenAt = someTimeAgo1;

        await expect(getUnreadEventsIntervalStart(null, seenAt, now), 'to equal', moment(seenAt));
      });

      it('should not send items which were already seen', async () => {
        const seenAt = someTimeAgo2;
        const sentAt = someTimeAgo1;

        await expect(getUnreadEventsIntervalStart(sentAt, seenAt, now), 'to equal', moment(seenAt));
      });

      it('should not send items which were sent previously', async () => {
        const seenAt = someTimeAgo1;
        const sentAt = someTimeAgo2;

        await expect(getUnreadEventsIntervalStart(sentAt, seenAt, now), 'to equal', moment(sentAt));
      });
    });

    describe('if sent 23 hours 30 minutes ago', () => {
      const sentAt = moment(now).subtract(23, 'hours').subtract(30, 'minutes').toISOString();

      it('should send recent items', async () => {
        const seenAt = longTimeAgo1;

        await expect(getUnreadEventsIntervalStart(sentAt, seenAt, now), 'to equal', moment(sentAt));
      });
    });

    describe('if sent less than 23 hours 30 minutes ago', () => {
      const sentAt = moment(now).subtract(23, 'hours').subtract(29, 'minutes').toISOString();

      it('should not send anything', async () => {
        const seenAt = longTimeAgo1;

        await expect(getUnreadEventsIntervalStart(sentAt, seenAt, now), 'to be null');
      });
    });
  });
});
