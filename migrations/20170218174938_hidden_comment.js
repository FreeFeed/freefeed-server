export async function up(knex) {
  await knex.schema
    .table('comments', (table) => {
      table.integer('hide_type').defaultTo(0).notNullable();
      table.index('hide_type', 'comments_hide_type_idx', 'btree');
    })
    .raw('alter table "comments" alter column "user_id" drop not null')
    .raw('alter table "comments" add constraint "comments_user_id_check" check (("hide_type" = 0) = ("user_id" is not null))');
}

export async function down(knex) {
  const { rows: [{ exists }] } = await knex.raw('select exists(select 1 from "comments" where "user_id" is null)');
  if (exists) {
    throw new Error('There are comments with null value in "user_id" column. Remove them before start this migration.');
  }

  await knex.schema
    .raw('alter table "comments" drop constraint "comments_user_id_check"')
    .raw('alter table "comments" alter column "user_id" set not null')
    .table('comments', (table) => {
      table.dropIndex('', 'comments_hide_type_idx');
      table.dropColumn('hide_type');
    });
}
