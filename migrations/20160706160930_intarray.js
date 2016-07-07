
export async function up(knex, Promise) {
  await Promise.all([
    knex.schema.table('posts', function(table) {
      table.dropIndex('', 'posts_feed_ids_idx');
      table.dropIndex('', 'posts_destination_feed_ids_idx');
    }),
    knex.schema.table('users', function(table) {
      table.dropIndex('', 'users_subscribed_feed_ids_idx');
      table.dropIndex('', 'users_hidden_feed_ids_idx');
    })
  ]);

  return Promise.all([
    knex.raw('create index "posts_feed_ids_idx" on "posts" USING gin (feed_ids gin__int_ops);'),
    knex.raw('create index "posts_destination_feed_ids_idx" on "posts" USING gin (destination_feed_ids gin__int_ops);'),

    knex.raw('create index "users_subscribed_feed_ids_idx" on "users" USING gin (subscribed_feed_ids gin__int_ops)'),
    knex.raw('create index "users_hidden_feed_ids_idx" on "users" USING gin (hidden_feed_ids gin__int_ops)'),
]);
}

export async function down(knex, Promise) {
  await Promise.all([
    knex.schema.table('posts', function(table) {
      table.dropIndex('', 'posts_feed_ids_idx');
      table.dropIndex('', 'posts_destination_feed_ids_idx');
    }),
    knex.schema.table('users', function(table) {
      table.dropIndex('', 'users_subscribed_feed_ids_idx');
      table.dropIndex('', 'users_hidden_feed_ids_idx');
    })
  ]);

  await Promise.all([
    knex.schema.table('posts', function(table) {
      table.index('feed_ids', 'posts_feed_ids_idx', 'gin');
      table.index('destination_feed_ids', 'posts_destination_feed_ids_idx', 'gin');
    }),
    knex.schema.table('users', function(table) {
      table.index('subscribed_feed_ids', 'users_subscribed_feed_ids_idx', 'gin');
      table.index('hidden_feed_ids', 'users_hidden_feed_ids_idx', 'gin');
    })
  ]);
}
