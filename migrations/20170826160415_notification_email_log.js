export async function up(knex) {
  await knex.schema.createTable('notification_email_log', (table) => {
    table.increments().notNullable().primary();
    table.integer('user_id').notNullable()
      .references('id').inTable('users')
      .onUpdate('cascade').onDelete('cascade');
    table.text('email').notNullable();
    table.timestamp('sent_at').defaultTo(knex.fn.now()).notNullable();
    table.index('user_id', 'email_log_user_id_idx', 'btree');
    table.index('sent_at', 'email_log_sent_at_idx', 'btree');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('notification_email_log');
}
