export function up(knex) {
  const { config } = knex.client;
  const { textSearchConfigName } = config;
  return knex.schema.raw(
    `CREATE INDEX IF NOT EXISTS comments_body_search_idx ON comments USING GIN (to_tsvector('${textSearchConfigName}', body))`,
  );
}

export function down(knex) {
  return knex.raw('DROP INDEX IF EXISTS comments_body_search_idx');
}
