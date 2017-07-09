export async function up(knex) {
  await knex.schema.table('posts', (posts) => {
    posts.index('user_id', 'posts_user_id_idx', 'btree');
  });
}

export async function down(knex) {
  await knex.schema.table('posts', (posts) => {
    posts.dropIndex('', 'posts_user_id_idx');
  });
}
