export async function up(knex, Promise) {
  await knex.schema.table('users', table => {
    table.timestamp('directs_read_at');
  });
}

export async function down(knex, Promise) {
  await knex.schema.table('users', table => {
    table.dropColumn('directs_read_at');
  });
}