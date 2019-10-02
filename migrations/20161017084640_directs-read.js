export async function up(knex) {
  await knex.schema.table('users', table => {
    table.timestamp('directs_read_at');
  });
}

export async function down(knex) {
  await knex.schema.table('users', table => {
    table.dropColumn('directs_read_at');
  });
}