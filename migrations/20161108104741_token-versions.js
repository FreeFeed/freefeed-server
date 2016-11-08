export async function up(knex) {
  await knex.schema.table('users', (table) => {
    table.integer('token_version');
  });
}

export async function down(knex) {
  await knex.schema.table('users', (table) => {
    table.dropColumn('token_version');
  });
}
