export async function up(knex) {
  await knex.schema.createTable('hidden_comments', (table) => {
    table.uuid('comment_id').notNullable().primary()
      .references('uid').inTable('comments').onUpdate('cascade').onDelete('cascade');
    table.text('body').notNullable();
    table.uuid('user_id')
      .references('uid').inTable('users').onUpdate('cascade').onDelete('cascade');
    table.text('old_username');
  });

  await knex.schema.createTable('hidden_likes', (table) => {
    table.increments('id').notNullable().primary();
    table.uuid('post_id').notNullable()
      .references('uid').inTable('posts').onUpdate('cascade').onDelete('cascade');
    table.timestamp('date').notNullable();
    table.uuid('user_id')
      .references('uid').inTable('users').onUpdate('cascade').onDelete('cascade');
    table.text('old_username');
  });

  await knex.schema.createTable('archive_post_names', (table) => {
    table.uuid('post_id').notNullable().primary()
      .references('uid').inTable('posts').onUpdate('cascade').onDelete('cascade');
    table.text('old_post_name').notNullable();
  });

  await knex.schema.createTable('archive_shortener', (table) => {
    table.text('short_code').notNullable().unique().primary();
    table.text('old_post_name').notNullable();
  });

  await knex.schema.createTable('archive_via', (table) => {
    table.increments('id').notNullable().primary();
    table.text('url').notNullable().unique();
    table.text('title').notNullable();
  });

  await knex.schema.createTable('archive_posts_via', (table) => {
    table.uuid('post_id').notNullable().primary()
      .references('uid').inTable('posts').onUpdate('cascade').onDelete('cascade');
    table.integer('via_id').notNullable()
      .references('id').inTable('archive_via').onUpdate('cascade').onDelete('cascade');
  });

  await knex.schema.createTable('archives', (table) => {
    table.text('old_username').notNullable().primary();
    table.uuid('user_id')
      .references('uid').inTable('users').onUpdate('cascade').onDelete('cascade');
    table.boolean('has_archive').notNullable().defaultTo(false);
    table.jsonb('via_sources').notNullable().defaultTo('[]');
    table.integer('recovery_status').notNullable().defaultTo(0);
    table.boolean('disable_comments').notNullable().defaultTo(false);
    table.boolean('restore_comments_and_likes').notNullable().defaultTo(false);
    table.specificType('via_restore', 'text[]').notNullable().defaultTo('{}');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('hidden_comments');
  await knex.schema.dropTableIfExists('hidden_likes');
  await knex.schema.dropTableIfExists('archive_post_names');
  await knex.schema.dropTableIfExists('archive_shortener');
  await knex.schema.dropTableIfExists('archive_posts_via');
  await knex.schema.dropTableIfExists('archive_via');
  await knex.schema.dropTableIfExists('archives');
}
