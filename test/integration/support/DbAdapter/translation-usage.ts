/* eslint-disable no-await-in-loop */
/* eslint-env node, mocha */

import expect from 'unexpected';

import cleanDB from '../../../dbCleaner';
import { dbAdapter } from '../../../../app/models';
import { createTestUser } from '../../../functional/functional_test_helper';
import { UUID } from '../../../../app/support/types';

const thisDate = '2023-01-15T14:00:00Z';
const nextMonth = '2023-02-10T12:00:00Z';
const monthAfterNext = '2023-03-21T17:00:00Z';

describe('translationUsageTrait', () => {
  beforeEach(() => cleanDB(dbAdapter.database));

  describe('Service-wide value (period is month and userId is null)', () => {
    it('should register and read value', async () => {
      await dbAdapter.registerTranslationUsage({ period: 'month', characters: 42, date: thisDate });
      const usage = await dbAdapter.getTranslationUsage({ period: 'month', date: thisDate });
      expect(usage, 'to be', 42);
    });

    it('should register value and read it on next month', async () => {
      await dbAdapter.registerTranslationUsage({ period: 'month', characters: 42, date: thisDate });
      const usage = await dbAdapter.getTranslationUsage({ period: 'month', date: nextMonth });
      expect(usage, 'to be', 27.75); // ~1/3 of Feb is passed, so we see only ~2/3 of Jan's value (42)
    });

    it('should add value from prev month to this month', async () => {
      await dbAdapter.registerTranslationUsage({ period: 'month', characters: 42, date: thisDate });
      await dbAdapter.registerTranslationUsage({
        period: 'month',
        characters: 10,
        date: nextMonth,
      });
      const usage = await dbAdapter.getTranslationUsage({ period: 'month', date: nextMonth });
      expect(usage, 'to be', 37.75);
    });

    it('should not see value on month after next', async () => {
      await dbAdapter.registerTranslationUsage({ period: 'month', characters: 42, date: thisDate });
      await dbAdapter.registerTranslationUsage({
        period: 'month',
        characters: 10,
        date: monthAfterNext,
      });
      const usage = await dbAdapter.getTranslationUsage({ period: 'month', date: monthAfterNext });
      expect(usage, 'to be', 10);
    });
  });

  describe('Per-user value (period is day and userId is not null)', () => {
    let userId: UUID;

    beforeEach(async () => {
      userId = (await createTestUser()).user.id;
    });

    it('should register and read value', async () => {
      await dbAdapter.registerTranslationUsage({
        userId,
        period: 'day',
        characters: 42,
        date: thisDate,
      });
      const usage = await dbAdapter.getTranslationUsage({ userId, period: 'day', date: thisDate });
      expect(usage, 'to be', 42);
    });

    it('should not read value of another user', async () => {
      await dbAdapter.registerTranslationUsage({
        userId,
        period: 'day',
        characters: 42,
        date: thisDate,
      });
      const userId2 = (await createTestUser()).user.id;
      const usage = await dbAdapter.getTranslationUsage({
        userId: userId2,
        period: 'day',
        date: thisDate,
      });
      expect(usage, 'to be', 0);
    });
  });
});
