export async function up(knex) {
  await knex.schema.table('users', (table) => {
    table.jsonb('providers').defaultTo('{}').notNullable();
  });
}

export async function down(knex) {
  await knex.schema.table('users', (table) => {
    table.dropColumn('providers');
  });
}
