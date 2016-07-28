
export async function up(knex, Promise) {
  await knex.schema.table('hashtag_usages', (table) => {
    table.uuid('entity_id');
    table.text('type').defaultTo('post').notNullable();
    table.unique(['entity_id', 'type', 'hashtag_id'], 'hashtag_usages_entity_id_type_hashtag_id_idx', 'btree');
    table.index('type', 'hashtag_usages_type_idx', 'btree');
  });

  await knex.raw('update hashtag_usages set entity_id = post_id');
  await knex.schema.table('hashtag_usages', (table) => {
    table.dropUnique(['post_id', 'hashtag_id'], 'hashtag_usages_post_id_hashtag_id_idx');
    table.dropColumn('post_id');
  });
}

export async function down(knex, Promise) {
  await knex.schema.table('hashtag_usages', (table) => {
    table.uuid('post_id')
      .references('uid').inTable('posts')
      .onUpdate('cascade').onDelete('cascade');
    table.unique(['post_id', 'hashtag_id'], 'hashtag_usages_post_id_hashtag_id_idx', 'btree');
  });

  await knex.raw("update hashtag_usages set post_id = entity_id where type = 'post'");
  await knex.schema.table('hashtag_usages', (table) => {
    table.dropIndex('type', 'hashtag_usages_type_idx');
    table.dropUnique(['entity_id', 'type', 'hashtag_id'], 'hashtag_usages_entity_id_type_hashtag_id_idx');
    table.dropColumn('type');
    table.dropColumn('entity_id');
  });
}
