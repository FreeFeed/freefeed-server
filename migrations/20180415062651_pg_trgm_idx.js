export async function up(knex) {
  await knex.raw(`create extension pg_trgm;`);
  await knex.raw(
    `create index posts_body_trgm_idx
      on posts
      using gist(body gist_trgm_ops);`
  );
  await knex.raw(
    `create index comments_body_trgm_idx
      on comments
      using gist(body gist_trgm_ops);`
  );
}

export async function down(knex) {
  await knex.raw(`drop index comments_body_trgm_idx;`);
  await knex.raw(`drop index posts_body_trgm_idx;`);
  await knex.raw(`drop extension pg_trgm;`);
}
