export async function up(knex) {
  await knex.schema.createTable('external_auth', (table) => {
    table.uuid('uid').defaultTo(knex.raw('gen_random_uuid()')).notNullable().primary();
    table.uuid('user_id').notNullable()
      .references('uid').inTable('users')
      .onUpdate('cascade').onDelete('cascade');
    table.text('provider').notNullable();
    table.text('external_id').notNullable();
    table.text('title').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();

    table.unique(['external_id', 'provider']);

    table.index('user_id');
    table.index(['provider', 'external_id']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('external_auth');
}
