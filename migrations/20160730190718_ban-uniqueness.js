
export async function up(knex) {
  await knex.raw(`DELETE FROM "bans" "b1" USING "bans" "b2" WHERE "b1"."user_id"="b2"."user_id" AND "b1"."banned_user_id"="b2"."banned_user_id" AND "b1"."id" < "b2"."id"`);
  await knex.schema.table('bans', (table) => {
    table.dropIndex('', 'bans_user_id_banned_id_idx');
    table.unique(['user_id', 'banned_user_id'], 'bans_post_id_user_id_unique_idx', 'btree');
  });
}

export async function down(knex) {
  await knex.schema.table('likes', (table) => {
    table.dropUnique('', 'bans_post_id_user_id_unique_idx');
    table.index(['user_id', 'banned_user_id'], 'bans_user_id_banned_id_idx', 'btree');
  });
}
