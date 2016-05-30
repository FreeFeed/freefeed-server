
exports.up = function(knex, Promise) {
  return Promise.all([
    knex.schema.createTable('user_stats', function(table) {
      table.increments().notNullable().primary();
      table.uuid('user_id').notNullable()
        .unique()
        .references('uid').inTable('users')
        .onUpdate('cascade').onDelete('cascade');
      table.biginteger('posts_count').unsigned().defaultTo(0).notNullable();
      table.biginteger('likes_count').unsigned().defaultTo(0).notNullable();
      table.biginteger('comments_count').unsigned().defaultTo(0).notNullable();
      table.biginteger('subscribers_count').unsigned().defaultTo(0).notNullable();
      table.biginteger('subscriptions_count').unsigned().defaultTo(0).notNullable();

      table.index('user_id', 'user_stats_user_id_idx', 'btree');
    })
  ]);
  
};

exports.down = function(knex, Promise) {
  return Promise.all([
    knex.schema.dropTableIfExists('user_stats')
  ]);
};
