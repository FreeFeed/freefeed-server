export async function up(knex) {
  await knex.schema.table('archive_post_names', (table) => {
    table.text('old_url');
  });
}

export async function down(knex) {
  await knex.schema.table('archive_post_names', (table) => {
    table.dropColumn('old_url');
  });
}
