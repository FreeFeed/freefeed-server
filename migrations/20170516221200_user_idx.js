export async function up(knex) {
  await knex.schema.table('comments', (posts) => {
    posts.index('user_id', 'comments_user_id_idx', 'btree');
  });

  await knex.schema.table('likes', (posts) => {
    posts.index('user_id', 'likes_user_id_idx', 'btree');
  });
}

export async function down(knex) {
  await knex.schema.table('comments', (posts) => {
    posts.dropIndex('', 'comments_user_id_idx');
  });

  await knex.schema.table('likes', (posts) => {
    posts.dropIndex('', 'likes_user_id_idx');
  });
}
