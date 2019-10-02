export async function up(knex) {
  await knex.schema.table('users', (table) => {
    table.jsonb('private_meta');
  });
}

export async function down(knex) {
  await knex.schema.table('users', (table) => {
    table.dropColumn('private_meta');
  });
}
