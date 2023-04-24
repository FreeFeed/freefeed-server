const calendarTrait = (superClass) =>
  class extends superClass {
    async getMyCalendarYearDays(currentUserId, year, tz) {
      const beginningOfTheYear = `${year}-01-01`;
      const endOfTheYear = `${year}-12-31`;

      const postsRestrictionsSQL = await this.postsVisibilitySQL(currentUserId);

      const sql = `
        SELECT
          TO_CHAR(p.created_at at time zone :tz, 'YYYY-MM-DD') as "date",
          count(*) "posts"
        FROM
          posts p
        JOIN
          users u on p.user_id = u.uid

        WHERE
          p.user_id = :currentUserId AND
          p.created_at >= :beginningOfTheYear AND
          p.created_at <= :endOfTheYear AND
          ${postsRestrictionsSQL}
        GROUP BY date
        ORDER BY date
      `;

      const { rows } = await this.database.raw(sql, {
        tz,
        currentUserId,
        beginningOfTheYear,
        endOfTheYear,
      });

      return rows.map(({ date, posts }) => ({ date, posts: parseInt(posts, 10) }));
    }

    async getMyCalendarPostsIds(currentUserId, date, tz, offset = 0, limit = 30) {
      const postsRestrictionsSQL = await this.postsVisibilitySQL(currentUserId);

      const sql = `
        SELECT
          p.uid
        FROM
          posts p
          join users u on p.user_id = u.uid
        WHERE
          p.user_id = :currentUserId AND
          DATE_TRUNC('day', p.created_at at time zone :tz) = :date AND
          ${postsRestrictionsSQL}
        ORDER BY
          p.created_at DESC
        LIMIT
          :limit
        OFFSET
          :offset
      `;

      const { rows } = await this.database.raw(sql, { tz, currentUserId, date, limit, offset });

      return rows.map((r) => r.uid);
    }
  };

export default calendarTrait;
