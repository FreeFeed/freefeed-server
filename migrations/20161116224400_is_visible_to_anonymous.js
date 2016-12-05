export async function up(knex) {
  await knex.schema.table('users', (table) => {
    table.boolean('is_visible_to_anonymous').defaultTo(true).notNullable();
    table.index('is_visible_to_anonymous', 'is_visible_to_anonymous_idx', 'btree');
  });
}

export async function down(knex) {
  await knex.schema.table('users', (table) => {
    table.dropIndex('', 'is_visible_to_anonymous_idx');
    table.dropColumn('is_visible_to_anonymous');
  });
}
