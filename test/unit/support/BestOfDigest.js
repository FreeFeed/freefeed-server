/* eslint-env node, mocha */
import unexpected from 'unexpected';
import unexpectedMoment from 'unexpected-moment';
import moment from 'moment';

import { shouldSendDailyBestOfDigest, shouldSendWeeklyBestOfDigest, canMakeBestOfEmail } from '../../../app/support/BestOfDigest';


const expect = unexpected.clone()
  .use(unexpectedMoment);

describe('BestOfDigest', () => {
  describe('shouldSendDailyBestOfDigest()', () => {
    const someTimeAgo = '2017-12-28T00:00:00.000Z';
    const now = '2018-01-01T00:00:00.000Z';

    describe('if weekly digest has never been sent previously', () => {
      describe('if daily digest has never been sent previously', () => {
        it('should send daily summary email', async () => {
          await expect(shouldSendDailyBestOfDigest(null, undefined, now), 'to be', true);
          await expect(shouldSendDailyBestOfDigest(undefined, undefined, now), 'to be', true);
        });
      });

      describe('if sent several days ago', () => {
        it('should send daily summary email', async () => {
          await expect(shouldSendDailyBestOfDigest(someTimeAgo, undefined, now), 'to be', true);
        });
      });

      describe('if sent 23 hours 31 minutes ago', () => {
        const sentAt = moment(now).subtract(23, 'hours').subtract(31, 'minutes').toISOString();

        it('should send daily summary email', async () => {
          await expect(shouldSendDailyBestOfDigest(sentAt, undefined, now), 'to be', true);
        });
      });

      describe('if sent less than (or eql to) 23 hours 30 minutes ago', () => {
        const sentAt = moment(now).subtract(23, 'hours').subtract(30, 'minutes').toISOString();

        it('should not send daily summary email', async () => {
          await expect(shouldSendDailyBestOfDigest(sentAt, undefined, now), 'to be', false);
        });
      });
    });

    describe('if weekly digest sent a day ago', () => {
      const weeklyDigestSentAt = moment(now).subtract(1, 'days').toISOString();

      describe('if daily digest has never been sent previously or sent before 23 hours 30 minutes ago', () => {
        it('should send daily summary email', async () => {
          await expect(shouldSendDailyBestOfDigest(null, weeklyDigestSentAt, now), 'to be', true);
          await expect(shouldSendDailyBestOfDigest(undefined, weeklyDigestSentAt, now), 'to be', true);
          await expect(shouldSendDailyBestOfDigest(someTimeAgo, weeklyDigestSentAt, now), 'to be', true);
        });
      });

      describe('if sent less than (or eql to) 23 hours 30 minutes ago', () => {
        const sentAt = moment(now).subtract(23, 'hours').subtract(30, 'minutes').toISOString();

        it('should not send daily summary email', async () => {
          await expect(shouldSendDailyBestOfDigest(sentAt, weeklyDigestSentAt, now), 'to be', false);
        });
      });
    });

    describe('if weekly digest sent today', () => {
      const weeklyDigestSentAt = moment(now).subtract(5, 'hours').toISOString();

      describe('if never sent previously or sent before 23 hours 30 minutes ago', () => {
        it('should not send daily summary email', async () => {
          await expect(shouldSendDailyBestOfDigest(null, weeklyDigestSentAt, now), 'to be', false);
          await expect(shouldSendDailyBestOfDigest(undefined, weeklyDigestSentAt, now), 'to be', false);
          await expect(shouldSendDailyBestOfDigest(someTimeAgo, weeklyDigestSentAt, now), 'to be', false);
        });
      });

      describe('if sent less than (or eql to) 23 hours 30 minutes ago', () => {
        const sentAt = moment(now).subtract(23, 'hours').subtract(30, 'minutes').toISOString();

        it('should not send daily summary email', async () => {
          await expect(shouldSendDailyBestOfDigest(sentAt, weeklyDigestSentAt, now), 'to be', false);
        });
      });
    });
  });

  describe('shouldSendWeeklyBestOfDigest()', () => {
    describe('if today is Monday', () => {
      const someTimeAgo = '2017-12-23T00:00:00.000Z';
      const now = '2018-01-01T00:00:00.000Z';

      describe('if weekly digest has never been sent previously', () => {
        it('should send weekly summary email', async () => {
          await expect(shouldSendWeeklyBestOfDigest(null, now), 'to be', true);
          await expect(shouldSendWeeklyBestOfDigest(undefined, now), 'to be', true);
        });
      });

      describe('if sent more than week ago', () => {
        it('should send weekly summary email', async () => {
          await expect(shouldSendWeeklyBestOfDigest(someTimeAgo, now), 'to be', true);
        });
      });

      describe('if sent 6 days 23 hours 31 minutes ago', () => {
        const sentAt = moment(now).subtract(6, 'days').subtract(23, 'hours').subtract(31, 'minutes').toISOString();

        it('should send weekly summary email', async () => {
          await expect(shouldSendWeeklyBestOfDigest(sentAt, now), 'to be', true);
        });
      });

      describe('if sent less than (or eql to) 6 days 23 hours 30 minutes ago', () => {
        const sentAt = moment(now).subtract(6, 'days').subtract(23, 'hours').subtract(30, 'minutes').toISOString();

        it('should not send weekly summary email', async () => {
          await expect(shouldSendWeeklyBestOfDigest(sentAt, now), 'to be', false);
        });
      });
    });

    describe('if today is not Monday', () => {
      const someTimeAgo = '2017-12-23T00:00:00.000Z';
      const now = '2018-01-02T00:00:00.000Z';

      describe('if weekly digest has never been sent previously', () => {
        it('should not send weekly summary email', async () => {
          await expect(shouldSendWeeklyBestOfDigest(null, now), 'to be', false);
          await expect(shouldSendWeeklyBestOfDigest(undefined, now), 'to be', false);
        });
      });

      describe('if sent more than week ago', () => {
        it('should not send weekly summary email', async () => {
          await expect(shouldSendWeeklyBestOfDigest(someTimeAgo, now), 'to be', false);
        });
      });

      describe('if sent 6 days 23 hours 31 minutes ago', () => {
        const sentAt = moment(now).subtract(6, 'days').subtract(23, 'hours').subtract(31, 'minutes').toISOString();

        it('should not send weekly summary email', async () => {
          await expect(shouldSendWeeklyBestOfDigest(sentAt, now), 'to be', false);
        });
      });

      describe('if sent less than (or eql to) 6 days 23 hours 30 minutes ago', () => {
        const sentAt = moment(now).subtract(6, 'days').subtract(23, 'hours').subtract(30, 'minutes').toISOString();

        it('should not send weekly summary email', async () => {
          await expect(shouldSendWeeklyBestOfDigest(sentAt, now), 'to be', false);
        });
      });
    });
  });

  describe('canMakeBestOfEmail()', () => {
    describe('when summaryPayload is null', () => {
      it('should return false', async () => {
        await expect(canMakeBestOfEmail(null), 'to be', false);
        await expect(canMakeBestOfEmail(undefined), 'to be', false);
      });
    });

    describe('when summaryPayload has inappropriate structure', () => {
      it('should return false', async () => {
        await expect(canMakeBestOfEmail({ a: 'a', b: 1 }), 'to be', false);
      });
    });

    describe('when summaryPayload contains zero number of posts', () => {
      it('should return false', async () => {
        await expect(canMakeBestOfEmail({ posts: [] }), 'to be', false);
      });
    });

    describe('when summaryPayload contains non-zero number of posts', () => {
      it('should return true', async () => {
        await expect(canMakeBestOfEmail({ posts: [{}] }), 'to be', true);
      });
    });
  });
});
