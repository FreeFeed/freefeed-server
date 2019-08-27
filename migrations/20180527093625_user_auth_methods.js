export async function up(knex) {
  await knex.schema.createTable('user_auth_methods', (table) => {
    table.increments();
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
    table.text('provider_id').notNullable().comment('Provider-specific user id');
    table.string('provider_name').notNullable();
    table.text('access_token');
    table.integer('user_id').notNullable()
      .references('id').inTable('users')
      .onUpdate('cascade').onDelete('cascade');
    table.jsonb('profile').defaultTo('{}').notNullable();

    table.unique(['provider_id', 'provider_name']);
    table.index('user_id');
  });
}

export async function down(knex) {
  await knex.schema.dropTable('user_auth_methods');
}
