import pgFormat from 'pg-format';

///////////////////////////////////////////////////
// Summary (a.k.a. "proper Best Of")
///////////////////////////////////////////////////

/**
 * Summary posts: the best 30 entries in last N days
 *
 * METRIC = 10 × U + 3 × C + L
 * - U is number of distinct users commented on the post
 * - C is number of comments
 * - L is number of likes
 */
const summaryTrait = (superClass) => class extends superClass {
  async getSummaryPosts(currentUserId, timelineIntId, days) {
    let privacyFilter = 'AND NOT posts.is_protected';
    let banFilter = '';

    if (currentUserId) {
      const [visiblePrivateFeedIntIds, bannedUserIds] = await Promise.all([
        this.getVisiblePrivateFeedIntIds(currentUserId),
        this.getBansAndBannersOfUser(currentUserId),
      ]);

      // Exclude private feeds viewer cannot read
      privacyFilter = pgFormat('AND (NOT posts.is_private OR posts.destination_feed_ids && %L)', `{${visiblePrivateFeedIntIds.join(',')}}`);

      // Exclude authors who banned viewer or were banned by viewer
      banFilter = (bannedUserIds.length > 0) ? pgFormat('AND (posts.user_id NOT IN (%L))', bannedUserIds) : '';
    }

    const sql = `
        SELECT
          posts.*,
          (
            10 * COALESCE(c.comment_authors_count, 0) + 
            3 * COALESCE(c.comments_count, 0) + 
            COALESCE(l.likes_count, 0)
          ) AS metric
        FROM
          posts
          LEFT JOIN
            (
              SELECT 
                post_id, COUNT(id) AS comments_count, COUNT(DISTINCT user_id) as comment_authors_count 
              FROM
                comments
              WHERE 
                created_at > (now() - ${days} * interval '1 day')
              GROUP BY
                comments.post_id
            ) AS c
            ON c.post_id = posts.uid
          LEFT JOIN
            (
              SELECT
                post_id, COUNT(id) AS likes_count 
              FROM 
                likes 
              WHERE 
                created_at > (now() - ${days} * interval '1 day')
              GROUP BY 
                likes.post_id
            ) AS l
            ON l.post_id = posts.uid
        WHERE
          posts.feed_ids && '{${timelineIntId}}' AND
          posts.created_at > (now() - ${days} * interval '1 day')
          ${privacyFilter}
          ${banFilter}
        ORDER BY
          metric DESC
        LIMIT
          30
      `;

    const res = await this.database.raw(sql);
    return res.rows;
  }
};

export default summaryTrait;
