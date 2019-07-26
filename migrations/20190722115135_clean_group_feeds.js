// Remove all non-Posts feeds that belongs to groups.
// Also remove these feeds from posts' feed_ids.
export async function up(knex) {
  await knex.raw(`
    with g as (
      select array_agg(f.id) as ids
      from feeds f join users u on f.user_id = u.uid
      where u.type = 'group' and f.name <> 'Posts'
    )
    update posts set feed_ids = feed_ids - g.ids 
      from g
      where feed_ids && g.ids;
  `);

  await knex.raw(`
    delete from feeds f using users u where
      f.user_id = u.uid
      and u.type = 'group'
      and f.name <> 'Posts'
  `);
}

export async function down() {
  // do nothing
}
