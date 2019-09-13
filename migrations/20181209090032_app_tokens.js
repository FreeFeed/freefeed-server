export async function up(knex) {
  await knex.schema.createTable('app_tokens', (table) => {
    table
      .uuid('uid')
      .defaultTo(knex.raw('gen_random_uuid()'))
      .notNullable()
      .primary();
    table
      .uuid('user_id')
      .notNullable()
      .references('uid')
      .inTable('users')
      .onUpdate('cascade')
      .onDelete('cascade');
    table.text('title').notNullable();
    table
      .boolean('is_active')
      .defaultTo(false)
      .notNullable();
    table
      .integer('issue')
      .defaultTo(1)
      .notNullable();
    table
      .timestamp('created_at')
      .defaultTo(knex.fn.now())
      .notNullable();
    table
      .timestamp('updated_at')
      .defaultTo(knex.fn.now())
      .notNullable();
    table
      .specificType('scopes', 'text[]')
      .defaultTo(knex.raw('ARRAY[]::text[]'))
      .notNullable();
    table
      .jsonb('restrictions')
      .defaultTo('{}')
      .notNullable();
    // Last usage
    table.timestamp('last_used_at');
    table.specificType('last_ip', 'inet');
    table.text('last_user_agent');
  });

  await knex.schema.createTable('app_tokens_log', (table) => {
    table
      .bigIncrements('id')
      .notNullable()
      .primary();
    table
      .uuid('token_id')
      .notNullable()
      .references('uid')
      .inTable('app_tokens')
      .onUpdate('cascade')
      .onDelete('cascade');
    table.text('request').notNullable();
    table
      .timestamp('date')
      .defaultTo(knex.fn.now())
      .notNullable();
    table.specificType('ip', 'inet').notNullable();
    table.text('user_agent').notNullable();
    table
      .jsonb('extra')
      .defaultTo('{}')
      .notNullable();
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('app_tokens_log');
  await knex.schema.dropTableIfExists('app_tokens');
}
