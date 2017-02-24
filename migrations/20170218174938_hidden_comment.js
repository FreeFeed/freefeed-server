export function up(knex) {
  return knex.schema.table('comments', (table) => {
    table.integer('hide_type').defaultTo(0).notNullable();
    table.index('hide_type', 'comments_hide_type_idx', 'btree');
  });
}

export function down(knex) {
  return knex.schema.table('comments', (table) => {
    table.dropIndex('', 'comments_hide_type_idx');
    table.dropColumn('hide_type');
  });
}
