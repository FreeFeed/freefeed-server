/* eslint-env node, mocha */
import unexpected from 'unexpected';
import unexpectedMoment from 'unexpected-moment';
import moment from 'moment';

import { shouldSendDailyBestOfDigest } from '../../../app/support/BestOfDigest';

const expect = unexpected.clone()
  .use(unexpectedMoment);

describe('BestOfDigest', () => {
  describe('shouldSendDailyBestOfDigest()', () => {
    const someTimeAgo = '2017-12-28T00:00:00.000Z';
    const now = '2018-01-01T00:00:00.000Z';

    describe('if never sent previously', () => {
      it('should send summary email', async () => {
        await expect(shouldSendDailyBestOfDigest(null, now), 'to be', true);
        await expect(shouldSendDailyBestOfDigest(undefined, now), 'to be', true);
      });
    });

    describe('if sent several days ago', () => {
      it('should send summary email', async () => {
        await expect(shouldSendDailyBestOfDigest(someTimeAgo, now), 'to be', true);
      });
    });

    describe('if sent 23 hours 31 minutes ago', () => {
      const sentAt = moment(now).subtract(23, 'hours').subtract(31, 'minutes').toISOString();

      it('should send summary email', async () => {
        await expect(shouldSendDailyBestOfDigest(sentAt, now), 'to be', true);
      });
    });

    describe('if sent less than (or eql to) 23 hours 30 minutes ago', () => {
      const sentAt = moment(now).subtract(23, 'hours').subtract(30, 'minutes').toISOString();

      it('should not send anything', async () => {
        await expect(shouldSendDailyBestOfDigest(sentAt, now), 'to be', false);
      });
    });
  });
});
