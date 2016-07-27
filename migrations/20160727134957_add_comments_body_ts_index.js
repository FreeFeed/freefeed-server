
export async function up(knex, Promise) {
  const config = knex.client.config
  const textSearchConfigName = config.textSearchConfigName
  return knex.schema.raw(`CREATE INDEX IF NOT EXISTS comments_body_search_idx ON comments USING GIN (to_tsvector('${textSearchConfigName}', body))`)
}

export async function down(knex, Promise) {
  return knex.raw('DROP INDEX IF EXISTS comments_body_search_idx')
}
