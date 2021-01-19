export async function up(knex) {
  await knex.schema.createTable('comment_likes', (table) => {
    table.increments().notNullable().primary();
    table
      .integer('comment_id')
      .notNullable()
      .references('id')
      .inTable('comments')
      .onUpdate('cascade')
      .onDelete('cascade');
    table
      .integer('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onUpdate('cascade')
      .onDelete('cascade');
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();

    table.unique(['comment_id', 'user_id'], 'comment_likes_comment_id_user_id_idx', 'btree');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('comment_likes');
}
