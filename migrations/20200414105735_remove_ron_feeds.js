// Remove all RiverOfNews feeds from the posts table. We don't need them anymore
// because of dynamic building of homefeeds.
//
// It is a long running (minutes) and non-reversible migration.
export async function up(knex) {
  await knex.raw(`with rons as (select array_agg(id) as ids from feeds where name = 'RiverOfNews')
  update posts set feed_ids = posts.feed_ids - rons.ids from rons where posts.feed_ids && rons.ids`);
}

export async function down() {
  // do nothing
}
