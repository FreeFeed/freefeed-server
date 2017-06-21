export async function up(knex) {
  await knex.schema.table('users', table => {
    table.timestamp('notifications_read_at');
  });
}

export async function down(knex) {
  await knex.schema.table('users', table => {
    table.dropColumn('notifications_read_at');
  });
}
