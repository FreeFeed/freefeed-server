export async function up(knex) {
  await knex.schema.table('events', (table) => {
    table.uuid('uid').defaultTo(knex.raw('gen_random_uuid()')).notNullable().unique();
  });
}
export async function down(knex) {
  await knex.schema.table('events', (table) => {
    table.dropColumn('uid');
  });
}
