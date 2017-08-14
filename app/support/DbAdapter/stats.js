import pgFormat from 'pg-format';

///////////////////////////////////////////////////
// Stats
///////////////////////////////////////////////////

const statsTrait = (superClass) => class extends superClass {
  async getStats(data, start_date, end_date) {
    const supported_metrics = ['comments', 'comments_creates', 'posts', 'posts_creates', 'users', 'registrations',
      'active_users', 'likes', 'likes_creates', 'comment_likes', 'comment_likes_creates', 'groups', 'groups_creates'];

    const metrics = data.split(',').sort();

    let metrics_req = ``, metrics_list = `''null''`;

    for (const metric of metrics) {
      if (supported_metrics.includes(metric)) {
        metrics_req += `, "${metric}" bigint`;
        metrics_list += `, ''${metric}''`;
      } else {
        throw new Error(`ERROR: unsupported metric: ${metric}`);
      }
    }

    if (!metrics_req.length) {
      return null;
    }

    const sql = pgFormat(`
      select * from crosstab(
        'select to_char(dt, ''YYYY-MM-DD'') as date, metric, value from stats 
          where dt between '%L' and '%L' 
            and metric in (%s)
          order by 1,2;')  
       AS ct ("date" text %s);`, start_date, end_date, metrics_list, metrics_req);

    const res = await this.database.raw(sql);
    return res.rows;
  }

  async getArchivesStats() {
    const FREEFEED_START_DATE = '2015-05-04';
    const [
      { count: restored_posts },
      { count: restored_comments },
      { count: hidden_comments },
      { count: restore_requests_completed },
      { count: restore_requests_pending },
      { count: users_with_restored_comments },
    ] = await Promise.all([
      this.database('posts').count('id').first().where('created_at', '<', FREEFEED_START_DATE),
      this.database('comments').count('id').first().where('created_at', '<', FREEFEED_START_DATE),
      this.database('hidden_comments').count('comment_id').first(),
      this.database('archives').count('user_id').first().where('recovery_status', '=', 2),
      this.database('archives').count('user_id').first().where('recovery_status', '=', 1),
      this.database('archives').count('user_id').first().where('restore_comments_and_likes', true),
    ]);

    return [{
      restored_posts,
      restored_comments,
      hidden_comments,
      restore_requests_completed,
      restore_requests_pending,
      users_with_restored_comments,
    }];
  }
};

export default statsTrait;
