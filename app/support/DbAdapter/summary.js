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
  async getSummaryPostsIds(currentUserId, days, timelineIntIds, activityIntIds = [], limit = null) {
    const DEFAULT_LIMIT = 30;
    limit = limit || DEFAULT_LIMIT;
    let privacyFilter = 'AND NOT posts.is_protected';
    let banFilter = '';

    if (currentUserId) {
      const [visiblePrivateFeedIntIds, bannedUserIds] = await Promise.all([
        this.getVisiblePrivateFeedIntIds(currentUserId),
        this.getUsersBansOrWasBannedBy(currentUserId),
      ]);

      // Exclude private feeds viewer cannot read
      privacyFilter = pgFormat('AND (NOT posts.is_private OR posts.destination_feed_ids && %L)', `{${visiblePrivateFeedIntIds.join(',')}}`);

      // Exclude authors who banned viewer or were banned by viewer
      banFilter = (bannedUserIds.length > 0) ? pgFormat('AND (posts.user_id NOT IN (%L))', bannedUserIds) : '';
    }

    privacyFilter += ' AND u.gone_status is null';

    let postSourceCondition = `posts.feed_ids && '{${timelineIntIds.join(',')}}'`;

    if (activityIntIds.length > 0) {
      postSourceCondition = `(${postSourceCondition} or posts.is_propagable and posts.feed_ids && '{${activityIntIds.join(',')}}')`;
    }

    const sql = `
        SELECT
          posts.uid,
          (
            10 * COALESCE(c.comment_authors_count, 0) + 
            3 * COALESCE(c.comments_count, 0) + 
            COALESCE(l.likes_count, 0)
          ) AS metric
        FROM
          posts
          join users u on posts.user_id = u.uid
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
                post_id, COUNT(likes.id) AS likes_count 
              FROM 
                likes 
                join users on likes.user_id = users.uid
              WHERE 
                likes.created_at > (now() - ${days} * interval '1 day')
                and users.gone_status is null
              GROUP BY 
                likes.post_id
            ) AS l
            ON l.post_id = posts.uid
        WHERE
          ${postSourceCondition} AND
          posts.created_at > (now() - ${days} * interval '1 day')
          ${privacyFilter}
          ${banFilter}
        ORDER BY
          metric DESC
        LIMIT
          ${limit}
      `;

    const { rows } = await this.database.raw(sql);
    return rows.map((r) => r.uid);
  }
};

export default summaryTrait;
