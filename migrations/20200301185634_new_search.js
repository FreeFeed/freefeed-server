export function up(knex) {
  return knex.schema
    .raw(`alter table "posts" add column "body_tsvector" tsvector`)
    .raw(`alter table "comments" add column "body_tsvector" tsvector`)
    .raw(`create index "posts_body_tsvector_idx" on "posts" using gin("body_tsvector")`)
    .raw(`create index "comments_body_tsvector_idx" on "comments" using gin("body_tsvector")`);
}

export function down(knex) {
  return knex.schema
    .raw(`alter table "posts" drop column "body_tsvector"`)
    .raw(`alter table "comments" drop column "body_tsvector"`);
}
