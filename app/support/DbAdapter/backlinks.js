import pgFormat from 'pg-format';
import config from 'config';

import { Comment } from '../../models';

///////////////////////////////////////////////////
// Backlinks
///////////////////////////////////////////////////

import { andJoin, sqlNotIn } from './utils';

const ftsCfg = config.postgres.textSearchConfigName;

const backlinksTrait = (superClass) =>
  class extends superClass {
    /**
     * @param {string[]} uids
     * @param {string|null} [viewerId]
     */
    async getBacklinksCounts(uids, viewerId = null) {
      const result = new Map();

      if (uids.length === 0) {
        return result;
      }

      const [
        // Private feeds viewer can read
        visiblePrivateFeedIntIds,
        // Users who banned viewer or banned by viewer (viewer should not see their posts)
        bannedUsersIds,
        // Users banned by viewer (for comments)
        bannedByViewer,
      ] = await Promise.all([
        viewerId ? this.getVisiblePrivateFeedIntIds(viewerId) : [],
        viewerId ? this.getUsersBansOrWasBannedBy(viewerId) : [],
        viewerId ? await this.getUserBansIds(viewerId) : [],
      ]);

      // Additional restrictions for comments
      const commentsRestrictionSQL = andJoin([
        pgFormat('c.hide_type=%L', Comment.VISIBLE),
        sqlNotIn('c.user_id', bannedByViewer),
      ]);

      const postsRestrictionsSQL = andJoin([
        // Privacy
        viewerId
          ? pgFormat(
              `(not p.is_private or p.destination_feed_ids && %L)`,
              `{${visiblePrivateFeedIntIds.join(',')}}`,
            )
          : 'not p.is_protected',
        // Bans
        sqlNotIn('p.user_id', bannedUsersIds),
        // Gone post's authors
        'u.gone_status is null',
      ]);

      const withPostsSQL = `with
        posts as (select p.* from posts p join users u on p.user_id = u.uid where ${andJoin([
          postsRestrictionsSQL,
          // Backlinks filter
          "p.body_tsvector @@ array_to_string(:uids::text[], ' | ')::tsquery",
        ])}),
        uids as (select * from unnest(:uids::uuid[]) as uids (uid))`;

      const withCommentsSQL = `with
        posts as (select p.* from posts p join users u on p.user_id = u.uid where ${postsRestrictionsSQL}),
        comments as (select c.* from comments c where ${andJoin([
          commentsRestrictionSQL,
          // Backlinks filter
          "c.body_tsvector @@ array_to_string(:uids::text[], ' | ')::tsquery",
        ])}),
        uids as (select * from unnest(:uids::uuid[]) as uids (uid))`;

      const [foundPosts, foundComments] = await Promise.all([
        this.database.getAll(
          `${withPostsSQL}
          select uids.uid, count(*)::int 
          from uids, posts p
          where
            p.body_tsvector @@ uids.uid::text::tsquery
            and p.uid <> uids.uid
          group by uids.uid`,
          { ftsCfg, uids },
        ),
        // [],
        this.database.getAll(
          `${withCommentsSQL}
          select uids.uid, count(*)::int
          from uids, comments c, posts p
          where
            c.post_id = p.uid
            and p.uid <> uids.uid
            and c.body_tsvector @@ uids.uid::text::tsquery
          group by uids.uid`,
          { ftsCfg, uids },
        ),
      ]);

      for (const row of [...foundPosts, ...foundComments]) {
        result.set(row.uid, (result.get(row.uid) || 0) + row.count);
      }

      return result;
    }
  };

export default backlinksTrait;
