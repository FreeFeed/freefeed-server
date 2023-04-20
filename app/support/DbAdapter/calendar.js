const calendarTrait = (superClass) =>
  class extends superClass {
    async getMyCalendarYearDays(currentUserId, year, tz) {
      const beginningOfTheYear = `${year}-01-01`;
      const endOfTheYear = `${year}-12-31`;

      const sql = `
        SELECT
          TO_CHAR(posts.created_at at time zone '${tz}', 'YYYY-MM-DD') as "date",
          count(*) "posts"
        FROM
          posts
        JOIN
          users u on posts.user_id = u.uid

        WHERE
          posts.user_id = '${currentUserId}' AND
          posts.created_at >= '${beginningOfTheYear}' AND
          posts.created_at <= '${endOfTheYear}'
        GROUP BY date
        ORDER BY date
      `;

      const { rows } = await this.database.raw(sql);

      return rows.map(({ date, posts }) => ({ date, posts: parseInt(posts, 10) }));
    }

    async getMyCalendarPostsIds(currentUserId, date, tz, offset = 0, limit = 30) {
      const sql = `
        SELECT
          posts.uid
        FROM
          posts
          join users u on posts.user_id = u.uid
        WHERE
          posts.user_id = '${currentUserId}' AND
          DATE_TRUNC('day', posts.created_at at time zone '${tz}') = '${date}'
        ORDER BY
          posts.created_at DESC
        LIMIT
          ${limit}
        OFFSET
          ${offset}
      `;

      const { rows } = await this.database.raw(sql);

      return rows.map((r) => r.uid);
    }
  };

export default calendarTrait;
