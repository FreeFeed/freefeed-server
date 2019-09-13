export async function up(knex) {
  await knex.schema.renameTable('notification_email_log', 'sent_emails_log');
  await knex.schema.table('sent_emails_log', (table) => {
    table
      .text('email_type')
      .defaultTo('notification')
      .notNullable();
    table.index('email_type', 'sent_emails_log_email_type_idx');
  });
}

export async function down(knex) {
  await knex.raw(`delete from sent_emails_log where email_type <> 'notification';`);
  await knex.schema.table('sent_emails_log', (table) => {
    table.dropIndex('', 'sent_emails_log_email_type_idx');
    table.dropColumn('email_type');
  });
  await knex.schema.renameTable('sent_emails_log', 'notification_email_log');
}
