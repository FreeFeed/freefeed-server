export function up(knex) {
  return knex.schema
    .raw('DROP INDEX IF EXISTS posts_body_search_idx')
    .raw(`alter table "posts" add column "body_tsvector" tsvector`)
    .raw(`alter table "comments" add column "body_tsvector" tsvector`)
    .raw(
      `create index "posts_body_tsvector_idx" on "posts" using gin("body_tsvector")`
    )
    .raw(
      `create index "comments_body_tsvector_idx" on "comments" using gin("body_tsvector")`
    );
}

export function down(knex) {
  const { textSearchConfigName } = knex.client.config;

  return knex.schema
    .raw(`alter table "posts" drop column "body_tsvector"`)
    .raw(`alter table "comments" drop column "body_tsvector"`)
    .raw(
      `CREATE INDEX IF NOT EXISTS posts_body_search_idx ON posts USING GIN (to_tsvector('${textSearchConfigName}', body))`
    );
}
