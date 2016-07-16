
export async function up(knex, Promise) {
  await knex.raw(`DELETE FROM "likes" "l1" USING "likes" "l2" WHERE "l1"."user_id"="l2"."user_id" AND "l1"."post_id"="l2"."post_id" AND "l1"."id" < "l2"."id"`);
  await knex.schema.table('likes', (table) => {
    table.dropIndex('', 'likes_post_id_user_id_idx');
    table.unique(['post_id', 'user_id'], 'likes_post_id_user_id_unique_idx', 'btree');
  });
}

export async function down(knex, Promise) {
  await knex.schema.table('likes', (table) => {
    table.dropUnique('', 'likes_post_id_user_id_unique_idx');
    table.index(['post_id', 'user_id'], 'likes_post_id_user_id_idx', 'btree');
  });
}
