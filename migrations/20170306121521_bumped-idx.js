export async function up(knex) {
  await knex.schema.table('posts', (posts) => {
    posts.index('bumped_at', 'bumped_at_idx', 'btree');
  });
}

export async function down(knex) {
  await knex.schema.table('posts', (posts) => {
    posts.dropIndex('', 'bumped_at_idx');
  });
}
