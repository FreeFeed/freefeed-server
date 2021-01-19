// ⚠ Warning! It is a long running (minutes) and non-reversible migration.

/* eslint no-await-in-loop: 0 */
import { difference } from 'lodash';

const allFeeds = [
  'RiverOfNews',
  'Hides',
  'Comments',
  'Likes',
  'Posts',
  'Directs',
  'MyDiscussions',
  'Saves',
];

const virtualFeeds = ['RiverOfNews', 'MyDiscussions'];

const feedsWithSubscribers = ['Comments', 'Likes', 'Posts'];

const feedsWithPosts = difference(allFeeds, virtualFeeds);

export async function up(knex) {
  const query = async function (sql, args = {}) {
    const { rows } = await knex.raw(sql, args);
    return rows;
  };

  await knex.raw('SET statement_timeout = 0'); // it might take a LONG time

  // Remove all RiverOfNews feeds from the posts table. We don't need them
  // anymore because of dynamic building of homefeeds.
  await query(`with rons as (select array_agg(id) as ids from feeds where name = 'RiverOfNews')
    update posts set feed_ids = posts.feed_ids - rons.ids from rons where posts.feed_ids && rons.ids`);

  // Select users that have more than one feeds with the same name. We should
  // keep only one of these feeds.
  const rows = await query(
    `select user_id, name from feeds group by user_id, name 
    having count(*) > 1 order by user_id, name`,
  );

  for (const { user_id: userId, name } of rows) {
    // All user's feeds of this name
    const feeds = await query(
      `select * from feeds 
      where user_id = :userId and name = :name 
      order by created_at`,
      { userId, name },
    );

    let feedUIDToKeep = feeds[0].uid;

    if (feedsWithPosts.includes(name) || feedsWithSubscribers.includes(name)) {
      const props = await Promise.all(
        feeds.map(async (feed) => {
          const [[{ exists: hasPosts }], [{ exists: hasSubscribers }]] = await Promise.all([
            query(
              `select exists (select 1 from posts where (feed_ids && :feedIds) or (destination_feed_ids && :feedIds))`,
              { feedIds: [feed.id] },
            ),
            query(`select exists (select 1 from subscriptions where feed_id = ?)`, [feed.uid]),
          ]);

          const inUse =
            (feedsWithPosts.includes(name) && hasPosts) ||
            (feedsWithSubscribers.includes(name) && hasSubscribers);
          return {
            id: feed.id,
            uid: feed.uid,
            hasPosts,
            hasSubscribers,
            inUse,
          };
        }),
      );

      const inUseCount = props.filter((p) => p.inUse).length;

      if (inUseCount > 1) {
        // User has more than one feed in use with the same name. Keeping the
        // first feed.
        const [first, ...toDelete] = props;

        // Move subscribers
        if (feedsWithSubscribers.includes(name) && toDelete.some((p) => p.hasSubscribers)) {
          const uidsToDelete = toDelete.map((f) => f.uid);
          const allSubscriptions = await query(
            `select user_id, created_at from subscriptions where feed_id = any(?)`,
            [uidsToDelete],
          );

          await Promise.all(
            allSubscriptions.map((s) =>
              query(
                `insert into subscriptions
              (feed_id, user_id, created_at) values (:feed_id, :user_id, :created_at)
              on conflict do nothing`,
                { ...s, feed_id: first.uid },
              ),
            ),
          );

          await query(`delete from subscriptions where feed_id = any(?)`, [uidsToDelete]);
        }

        // Move posts feeds
        if (feedsWithPosts.includes(name) && toDelete.some((p) => p.hasPosts)) {
          const idsToDelete = toDelete.map((f) => f.id);
          const firstId = first.id;
          const fields = ['feed_ids', 'destination_feed_ids'];

          // Add firstId to posts with idsToDelete
          await Promise.all(
            fields.map((field) =>
              query(
                `update posts set ${field} = (${field} | :firstId::int) where ${field} && :idsToDelete`,
                { firstId, idsToDelete },
              ),
            ),
          );

          // Remove idsToDelete
          await Promise.all(
            fields.map((field) =>
              query(
                `update posts set ${field} = (${field} - :idsToDelete) where ${field} && :idsToDelete`,
                { firstId, idsToDelete },
              ),
            ),
          );
        }
      } else if (inUseCount === 1) {
        feedUIDToKeep = props.find((p) => p.inUse).uid;
      } else {
        // Can safely remove all feeds except first
      }
    } else {
      // Can safely remove all feeds except first
    }

    await query(`delete from feeds where uid = any(?)`, [
      feeds.map((f) => f.uid).filter((uid) => uid !== feedUIDToKeep),
    ]);
  }

  // Add unique constraint on feeds table for user_id and name
  await knex.raw(`alter table feeds add constraint feeds_unique_feed_names unique(user_id, name)`);
}

export async function down(knex) {
  await knex.raw(`alter table feeds drop constraint feeds_unique_feed_names`);
}
