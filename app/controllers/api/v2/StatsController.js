import moment from 'moment';
import { dbAdapter } from '../../../models';

export default class StatsController {
  static async stats(ctx) {
    const MIN_START_DATE = '2015-05-04';
    const DEFAULT_END_DATE = moment().format('YYYY-MM-DD');
    const MAX_STATS_PERIOD = 365 * 2; // 2 years

    const data = ctx.request.query.data || 'users';
    const start_date = ctx.request.query.start_date || MIN_START_DATE;
    const end_date = ctx.request.query.end_date || DEFAULT_END_DATE;

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

    // fail if end < start
    if (end.isBefore(start)) {
      throw new Error(`ERROR: end date is before the start date`);
    }

    if (end.diff(start, 'days') > MAX_STATS_PERIOD) {
      throw new Error(`ERROR: the requested period is too long`);
    }

    const stats_res = await dbAdapter.getStats(data, start.format(`YYYY-MM-DD`), end.format(`YYYY-MM-DD`));

    if (!stats_res) {
      ctx.status = 404;
      ctx.body = { stats: 'Not found' };
    }

    ctx.body = { stats: stats_res };
  }
}
