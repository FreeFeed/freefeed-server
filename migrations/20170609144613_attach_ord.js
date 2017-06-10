export async function up(knex) {
  await knex.schema.table('attachments', (table) => {
    table.integer('ord').defaultTo(0);
  });
}

export async function down(knex) {
  await knex.schema.table('attachments', (table) => {
    table.dropColumn('ord');
  });
}
