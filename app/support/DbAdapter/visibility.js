import { intersection } from 'lodash';

import { List } from '../open-lists';

import { andJoin, orJoin, sqlIntarrayIn, sqlNotIn } from './utils';

const visibilityTrait = (superClass) =>
  class extends superClass {
    /**
     * A general SQL that filters posts using bans and privates visibility rules.
     *
     * See doc/visibility-rules.md for the rules details.
     */
    async postsVisibilitySQL(viewerId = null, { postsTable = 'p', postAuthorsTable = 'u' } = {}) {
      if (!viewerId) {
        return andJoin([
          `${postAuthorsTable}.gone_status is null`,
          `not ${postsTable}.is_protected`,
        ]);
      }

      const [
        // Private feeds viewer can read
        visiblePrivateFeedIntIds,
        groupsWithDisabledBans,
        managedGroups,
        // Users banned by viewer
        bannedByViewer,
        // Users who banned viewer
        viewerBannedBy,
      ] = await Promise.all([
        this.getVisiblePrivateFeedIntIds(viewerId),
        this.getGroupsWithDisabledBans(viewerId),
        this.getManagedGroupIds(viewerId),
        this.getUserBansIds(viewerId),
        this.getUserIdsWhoBannedUser(viewerId),
      ]);

      const managedGroupsWithDisabledBans = intersection(managedGroups, groupsWithDisabledBans);

      const [feedsOfGroupsWithDisabledBans, feedsOfManagedGroupsWithDisabledBans] =
        await Promise.all([
          this.getUsersNamedFeedsIntIds(groupsWithDisabledBans, ['Posts']),
          this.getUsersNamedFeedsIntIds(managedGroupsWithDisabledBans, ['Posts']),
        ]);

      const bansSQL = andJoin([
        // 1. Viewer should see posts of banned users in feedsWithDisabledBans
        orJoin([
          sqlNotIn('p.user_id', bannedByViewer),
          sqlIntarrayIn('p.destination_feed_ids', feedsOfGroupsWithDisabledBans),
        ]),
        // 2. Viewer should see posts of users banned him in feedsOfManagedGroupsWithDisabledBans
        orJoin([
          sqlNotIn('p.user_id', viewerBannedBy),
          sqlIntarrayIn('p.destination_feed_ids', feedsOfManagedGroupsWithDisabledBans),
        ]),
      ]);

      return andJoin([
        // Privacy
        viewerId
          ? orJoin([
              'not p.is_private',
              sqlIntarrayIn('p.destination_feed_ids', visiblePrivateFeedIntIds),
            ])
          : 'not p.is_protected',
        // Bans
        bansSQL,
        // Gone post's authors
        'u.gone_status is null',
      ]);
    }

    async isPostVisibleForViewer(postId, viewerId = null) {
      const visibilitySQL = await this.postsVisibilitySQL(viewerId);
      return await this.database.getOne(
        `select exists(
            select 1 from 
              posts p join users u on p.user_id = u.uid
              where p.uid = :postId and ${visibilitySQL}
          )`,
        { postId },
      );
    }

    /**
     * List (as in support/open-lists) of users that can see the given post.
     * This method doesn't received postId because it can be called after the
     * actual post deletion, but with saved post properties.
     *
     * See doc/visibility-rules.md for the visibility rules.
     */
    async getUsersWhoCanSeePost({ authorId, destFeeds }) {
      if (
        await this.database.getOne(
          'select gone_status is not null from users where uid = :authorId',
          { authorId },
        )
      ) {
        return List.empty();
      }

      const groups = await this.database.getCol(
        `select u.uid
          from users u join feeds f on f.user_id = u.uid and f.name = 'Posts'
          where u.type = 'group' and f.id = any(:destFeeds)`,
        { destFeeds },
      );

      const [
        // Users banned by author
        bannedByAuthor,
        // Users who banned author
        authorBannedBy,
      ] = await Promise.all([
        this.getUserBansIds(authorId),
        this.getUserIdsWhoBannedUser(authorId),
      ]);

      const usersDisabledBans =
        groups.length > 0
          ? await this.database.getAll(
              `select
              gb.user_id,
              a.user_id is not null as is_admin
          from
              groups_without_bans gb 
              left join group_admins a on
                (a.group_id, a.user_id) = (gb.group_id, gb.user_id)
            where
              a.group_id = any(:groups)`,
              { groups },
            )
          : [];

      // Users who choose to see banned posts in any of post group
      const allWhoDisabledBans = usersDisabledBans.map((r) => r.user_id);
      // Users who are admins of any post group and choose to see banned posts in it
      const adminsWhoDisabledBans = usersDisabledBans
        .filter((r) => r.is_admin)
        .map((r) => r.user_id);

      const allExceptBanned = List.difference(
        List.everything(),
        List.union(
          List.difference(authorBannedBy, allWhoDisabledBans),
          List.difference(bannedByAuthor, adminsWhoDisabledBans),
        ),
      );

      const privacyAllowed = await this.getUsersWhoCanSeeFeeds(destFeeds);

      return List.intersection(privacyAllowed, allExceptBanned);
    }

    /**
     * Return post ids (from postIds) visible by the given user. The order of
     * ids is preserved.
     * @param {string[]} postIds
     * @param {string} userId
     * @return {Promise<string[]>}
     */
    async selectPostsVisibleByUser(postIds, viewerId = null) {
      const restrictionsSQL = await this.postsVisibilitySQL(viewerId);
      return this.database.getCol(
        `select p.uid from
              unnest(:postIds::uuid[]) with ordinality as src (uid, ord)
              join posts p on src.uid = p.uid
              join users u on p.user_id = u.uid
            where ${restrictionsSQL} order by src.ord`,
        { postIds },
      );
    }
  };

export default visibilityTrait;
