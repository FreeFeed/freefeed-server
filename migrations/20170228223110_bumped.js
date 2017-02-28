export async function up(knex) {
  await knex.schema.table('posts', (posts) => {
    posts.timestamp('bumped_at').defaultTo(knex.fn.now()).notNullable();
  });

  await knex.raw('UPDATE "posts" SET "bumped_at" = "updated_at"');
}

export async function down(knex) {
  await knex.schema.table('posts', (posts) => {
    posts.dropColumn('bumped_at');
  });
}
