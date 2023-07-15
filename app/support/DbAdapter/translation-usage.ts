import { ISO8601DateTimeString, UUID } from '../types';

import { type DbAdapter } from './index';

export type RegisterOptions = {
  userId?: UUID | null;
  date?: ISO8601DateTimeString | 'now';
  period: 'day' | 'month';
  characters: number;
};

export type UsageOptions = {
  userId?: UUID | null;
  date?: ISO8601DateTimeString | 'now';
  period: 'day' | 'month';
};

export default (superClass: typeof DbAdapter) =>
  class extends superClass {
    async registerTranslationUsage({
      userId = null,
      date = 'now',
      period,
      characters,
    }: RegisterOptions): Promise<void> {
      await this.database.raw(
        `insert into translation_usage (user_id, period, date, characters)
          values (:userId, :period, date_trunc(:period, :date::timestamptz), :characters)
          on conflict (user_id, period, date) do
            update set characters = translation_usage.characters + excluded.characters`,
        { userId, period, date, characters },
      );
    }

    async getTranslationUsage({
      userId = null,
      period,
      date = 'now',
    }: UsageOptions): Promise<number> {
      const [nowUsage, prevUsage, nowPart] = await Promise.all([
        this.database.getOne<number | null>(
          `select characters from translation_usage where
          user_id is not distinct from :userId and period = :period
            and date = date_trunc(:period, :date::timestamptz)`,
          { userId, period, date },
        ),
        this.database.getOne<number | null>(
          `select characters from translation_usage where
          user_id is not distinct from :userId and period = :period 
            and date = date_trunc(:period, :date::timestamptz) - :step::interval`,
          { userId, period, date, step: `1 ${period}` },
        ),
        this.database.getOne<number>(
          `select 
            (extract(epoch from :date::timestamptz)
              - extract(epoch from date_trunc(:period, :date::timestamptz)))
            /
            (extract(epoch from date_trunc(:period, :date::timestamptz) + :step::interval)
              - extract(epoch from date_trunc(:period, :date::timestamptz)))`,
          { date, period, step: `1 ${period}` },
        ),
      ]);

      // Sliding window approximation using the current and previous interval data
      return (nowUsage ?? 0) + (prevUsage ?? 0) * (1 - nowPart);
    }

    async cleanOldTranslationUsageData(now: ISO8601DateTimeString | 'now' = 'now') {
      await this.database.raw(
        `delete from translation_usage where
          date < date_trunc(period, :now::timestamptz) - ('2 ' || period)::interval`,
        { now },
      );
    }
  };
