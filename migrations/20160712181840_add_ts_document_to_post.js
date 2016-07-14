
export async function up(knex, Promise) {
  const config = knex.client.config
  const textSearchConfigName = config.textSearchConfigName
  await Promise.all([
    knex.schema.table('posts', function(table) {
      table.text('ts_document');
    }),
    knex.schema.raw(`CREATE INDEX IF NOT EXISTS posts_ts_document_idx ON posts USING GIN (to_tsvector('${textSearchConfigName}', ts_document))`)
  ]);

  return knex.raw("UPDATE posts SET ts_document=(SELECT posts.body || ' ' || string_agg(c.body,' ') FROM comments AS c WHERE c.post_id=posts.uid)")
}

export async function down(knex, Promise) {
  return Promise.all([
    knex.raw('DROP INDEX IF EXISTS posts_ts_document_idx'),
    knex.schema.table('posts', function(table) {
      table.dropColumn('ts_document');
    })
  ])
}
