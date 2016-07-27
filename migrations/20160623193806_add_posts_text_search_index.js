
exports.up = function(knex, Promise) {
  const config = knex.client.config
  const textSearchConfigName = config.textSearchConfigName
  return knex.schema.raw(`CREATE INDEX IF NOT EXISTS posts_body_search_idx ON posts USING GIN (to_tsvector('${textSearchConfigName}', body))`)
};

exports.down = function(knex, Promise) {
  return knex.raw('DROP INDEX IF EXISTS posts_body_search_idx')
};
