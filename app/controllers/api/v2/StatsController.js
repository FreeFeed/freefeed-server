import moment from 'moment';
import { dbAdapter } from '../../../models';
import { reportError } from '../../../support/exceptions';

export default class StatsController {
  static async stats(req, res) {
    const MIN_START_DATE = '2015-05-04';
    const DEFAULT_END_DATE = moment().format('YYYY-MM-DD');
    const MAX_STATS_PERIOD = 365 * 2; // 2 years

    const data = req.query.data || 'users';
    const start_date = req.query.start_date || MIN_START_DATE;
    const end_date = req.query.end_date || DEFAULT_END_DATE;

    try {
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

      if (data !== 'users') {
        throw new Error(`ERROR: only 'users' data is currently supported`);
      }

      const stats_res = await dbAdapter.getStats(data, start.format(`YYYY-MM-DD`), end.format(`YYYY-MM-DD`));

      if (stats_res) {
        stats_res.forEach((stat) => {
          stat['date'] = moment(stat['date']).format(`YYYY-MM-DD`);
        });

        res.jsonp({ stats: stats_res });
      } else {
        res.status(401).jsonp({ stats: 'Not found' });
      }
    } catch (e) {
      reportError(res)(e);
    }
  }
}
