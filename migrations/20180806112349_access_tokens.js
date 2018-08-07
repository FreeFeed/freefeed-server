export async function up(knex) {
  await knex.schema.createTable('access_tokens', (table) => {
    table.increments().notNullable().primary();
    table.uuid('uid').defaultTo(knex.raw('gen_random_uuid()')).notNullable().unique();

    table.uuid('user_id').notNullable()
      .references('uid').inTable('users')
      .onUpdate('cascade').onDelete('cascade');

    table.text('description').notNullable();
    table.text('code').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('last_used_at').defaultTo(null).nullable();
    table.enu('status', ['active', 'revoked']).defaultTo('active').notNullable();

    table.index('user_id', 'access_tokens_user_id_idx', 'btree');
    table.index(['uid', 'user_id'], 'access_tokens_uid_user_id_idx', 'btree');
    table.index(['code', 'status'], 'access_tokens_code_status_idx', 'btree');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('access_tokens');
}
