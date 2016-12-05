export function up(knex) {
  return knex.schema
    .table('users', (table) => table.boolean('is_protected').defaultTo(false).notNullable())
    .raw('update users set is_protected = (is_private or not is_visible_to_anonymous)')
    .raw('alter table users add constraint users_is_protected_check check (is_protected or not is_private)')
    .table('users', (table) => {
      table.dropIndex('', 'is_visible_to_anonymous_idx');
      table.dropColumn('is_visible_to_anonymous');
      table.index('is_protected', 'users_is_protected_idx', 'btree');
    });
}

export async function down(knex) {
  return knex.schema
    .table('users', (table) => table.boolean('is_visible_to_anonymous').defaultTo(true).notNullable())
    .raw('update users set is_visible_to_anonymous = (not is_private and not is_protected)')
    .raw('alter table users drop constraint users_is_protected_check')
    .table('users', (table) => {
      table.dropIndex('', 'users_is_protected_idx');
      table.dropColumn('is_protected');
      table.index('is_visible_to_anonymous', 'is_visible_to_anonymous_idx', 'btree');
    });
}
