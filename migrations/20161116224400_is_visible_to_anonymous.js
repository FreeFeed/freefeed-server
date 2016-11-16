export async function up(knex, Promise) {
  await knex.schema.table('users', table => {
    table.boolean('is_visible_to_anonymous').defaultTo(true).notNullable();
    table.index('is_visible_to_anonymous', 'is_visible_to_anonymous_idx', 'btree');
  });
}

export async function down(knex, Promise) {
  await knex.schema.table('users', table => {
    table.dropColumn('is_visible_to_anonymous');
  return knex.raw('DROP INDEX IF EXISTS is_visible_to_anonymous_idx')
  });
}