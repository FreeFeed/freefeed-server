
export async function up(knex) {
  await knex.schema.createTable('hashtags', (table) => {
    table.increments().notNullable().primary();
    table.text('name').notNullable().unique();

    table.index('name', 'hashtags_name_idx', 'btree');
  });

  await knex.schema.createTable('hashtag_usages', (table) => {
    table.increments().notNullable().primary();
    table.uuid('post_id').notNullable()
      .references('uid').inTable('posts')
      .onUpdate('cascade').onDelete('cascade');
    table.integer('hashtag_id').notNullable()
      .references('id').inTable('hashtags')
      .onUpdate('cascade').onDelete('cascade');

    table.unique(['post_id', 'hashtag_id'], 'hashtag_usages_post_id_hashtag_id_idx', 'btree');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('hashtag_usages');
  await knex.schema.dropTableIfExists('hashtags');
}
