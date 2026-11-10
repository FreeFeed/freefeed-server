export async function up(knex) {
  await knex.schema.table('posts', function (table) {
    table.dropIndex('', 'posts_feed_ids_idx');
    table.dropIndex('', 'posts_destination_feed_ids_idx');
  });

  await knex.schema.table('users', function (table) {
    table.dropIndex('', 'users_subscribed_feed_ids_idx');
    table.dropIndex('', 'users_hidden_feed_ids_idx');
  });

  await knex.raw('create index "posts_feed_ids_idx" on "posts" USING gin (feed_ids gin__int_ops);');

  await knex.raw(
    'create index "posts_destination_feed_ids_idx" on "posts" USING gin (destination_feed_ids gin__int_ops);',
  );

  await knex.raw(
    'create index "users_subscribed_feed_ids_idx" on "users" USING gin (subscribed_feed_ids gin__int_ops)',
  );

  await knex.raw(
    'create index "users_hidden_feed_ids_idx" on "users" USING gin (hidden_feed_ids gin__int_ops)',
  );
}

export async function down(knex) {
  await knex.schema.table('posts', function (table) {
    table.dropIndex('', 'posts_feed_ids_idx');
    table.dropIndex('', 'posts_destination_feed_ids_idx');
  });

  await knex.schema.table('users', function (table) {
    table.dropIndex('', 'users_subscribed_feed_ids_idx');
    table.dropIndex('', 'users_hidden_feed_ids_idx');
  });

  await knex.schema.table('posts', function (table) {
    table.index('feed_ids', 'posts_feed_ids_idx', 'gin');
    table.index('destination_feed_ids', 'posts_destination_feed_ids_idx', 'gin');
  });

  await knex.schema.table('users', function (table) {
    table.index('subscribed_feed_ids', 'users_subscribed_feed_ids_idx', 'gin');
    table.index('hidden_feed_ids', 'users_hidden_feed_ids_idx', 'gin');
  });
}
