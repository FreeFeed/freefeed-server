import moment from 'moment';

export default class StatsController {
  static async stats(ctx) {
    const MAX_STATS_PERIOD = 365 * 2; // 2 years
    const MIN_START_DATE = moment('20150504'); // FreeFeed launched

    const DEFAULT_START_DATE = moment().subtract(MAX_STATS_PERIOD, 'days').format('YYYY-MM-DD');
    const DEFAULT_END_DATE = moment().format('YYYY-MM-DD');

    const data = ctx.request.query.data || 'users';
    let { start_date, end_date } = ctx.request.query;

    if (!start_date) {
      if (end_date) {
        start_date = moment(end_date).subtract(MAX_STATS_PERIOD, 'days').format('YYYY-MM-DD');
      } else {
        start_date = DEFAULT_START_DATE;
        end_date = DEFAULT_END_DATE;
      }
    }

    if (!end_date) {
      end_date = moment(start_date).add(MAX_STATS_PERIOD, 'days').format('YYYY-MM-DD');
    }

    let start = moment(start_date);
    let end = moment(end_date);

    // adjust if the end period is in future
    if (moment().isBefore(end)) {
      end = moment();
    }

    // adjust if start is before MIN_START_DATE
    if (start.isBefore(MIN_START_DATE)) {
      start = moment(MIN_START_DATE);
    }

    // adjust if end is before MIN_START_DATE
    if (end.isBefore(MIN_START_DATE)) {
      end = moment(MIN_START_DATE);
    }

    // fail if end < start
    if (end.isBefore(start)) {
      throw new Error(`ERROR: end date is before the start date`);
    }

    if (end.diff(start, 'days') > MAX_STATS_PERIOD) {
      throw new Error(`ERROR: the requested period is too long`);
    }

    const stats_res = await ctx.modelRegistry.dbAdapter.getStats(
      data,
      start.format(`YYYY-MM-DD`),
      end.format(`YYYY-MM-DD`),
    );

    if (!stats_res) {
      ctx.status = 404;
      ctx.body = { stats: 'Not found' };
    }

    ctx.body = { stats: stats_res };
  }
}
