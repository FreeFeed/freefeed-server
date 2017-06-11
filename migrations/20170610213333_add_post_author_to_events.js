export async function up(knex) {
  await knex.schema.table('events', (events) => {
    events.integer('post_author_id');
    events.index('post_author_id', 'events_post_author_id_idx', 'btree');
  });
}

export async function down(knex) {
  await knex.schema.table('events', (events) => {
    events.dropIndex('post_author_id', 'events_post_author_id_idx');
    events.dropColumn('post_author_id');
  });
}
