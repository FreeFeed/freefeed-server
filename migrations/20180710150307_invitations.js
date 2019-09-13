export async function up(knex) {
  await knex.schema.createTable('invitations', (table) => {
    table
      .increments()
      .notNullable()
      .primary();
    table
      .uuid('secure_id')
      .defaultTo(knex.raw('gen_random_uuid()'))
      .notNullable()
      .unique();
    table
      .integer('author')
      .notNullable()
      .references('id')
      .inTable('users')
      .onUpdate('cascade')
      .onDelete('cascade');
    table.text('message').notNullable();
    table.text('lang').notNullable();
    table
      .boolean('single_use')
      .defaultTo(false)
      .notNullable();
    table
      .jsonb('recommendations')
      .defaultTo('{}')
      .notNullable();
    table
      .integer('registrations_count')
      .defaultTo(0)
      .notNullable();
    table
      .timestamp('created_at')
      .defaultTo(knex.fn.now())
      .notNullable();

    table.index('secure_id', 'invitations_secure_id_idx', 'btree');
    table.index('author', 'invitations_author_idx', 'btree');
    table.index('created_at', 'invitations_created_at_idx', 'btree');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('invitations');
}
