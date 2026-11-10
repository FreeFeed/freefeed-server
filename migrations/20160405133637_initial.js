export async function up(knex) {
  await knex.raw('SET statement_timeout = 0');

  await knex.raw('SET lock_timeout = 0');

  await knex.raw("SET client_encoding = 'UTF8'");

  await knex.raw('SET standard_conforming_strings = on');

  await knex.raw('SET check_function_bodies = false');

  await knex.raw('SET client_min_messages = warning');

  await knex.raw('SET row_security = off');

  await knex.raw('CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog');

  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');

  await knex.raw('CREATE EXTENSION IF NOT EXISTS intarray WITH SCHEMA public');

  await knex.raw('SET search_path = public, pg_catalog');

  await knex.raw("SET default_tablespace = ''");

  await knex.raw('SET default_with_oids = false');

  await knex.schema.createTable('users', function (table) {
    table.increments().notNullable().primary();
    table.uuid('uid').defaultTo(knex.raw('gen_random_uuid()')).notNullable().unique();
    table.text('username').notNullable().unique();
    table.text('screen_name').notNullable();
    table.text('description').defaultTo('').notNullable();
    table.text('type').defaultTo('user').notNullable();
    table.text('profile_picture_uuid');
    table.text('email'); // NB! email not required here, maybe change?
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
    table.boolean('is_private').defaultTo(false).notNullable();
    table.boolean('is_restricted').defaultTo(false).notNullable();
    table.text('hashed_password');
    table.text('reset_password_token');
    table.timestamp('reset_password_sent_at');
    table.timestamp('reset_password_expires_at');
    table.text('frontend_preferences');
    table
      .specificType('subscribed_feed_ids', 'integer[]')
      .defaultTo(knex.raw('ARRAY[]::integer[]'))
      .notNullable();
    table
      .specificType('hidden_feed_ids', 'integer[]')
      .defaultTo(knex.raw('ARRAY[]::integer[]'))
      .notNullable();

    table.index('uid', 'users_uid_idx', 'btree');
    table.index('username', 'users_username_idx', 'btree');
    table.index('type', 'users_type_idx', 'btree');
    table.index('email', 'users_email_idx', 'btree');
    table.index('created_at', 'users_created_at_idx', 'btree');
    table.index('updated_at', 'users_updated_at_idx', 'btree');
    table.index('is_private', 'users_is_private_idx', 'btree');
    table.index('is_restricted', 'users_is_restricted_idx', 'btree');
    table.index('reset_password_token', 'users_reset_password_token_idx', 'btree');
    table.index('subscribed_feed_ids', 'users_subscribed_feed_ids_idx', 'gin');
    table.index('hidden_feed_ids', 'users_hidden_feed_ids_idx', 'gin');
  });

  await knex.schema.createTable('posts', function (table) {
    table.increments().notNullable().primary();
    table.uuid('uid').defaultTo(knex.raw('gen_random_uuid()')).notNullable().unique();
    table.text('body');
    table
      .uuid('user_id')
      .notNullable()
      .references('uid')
      .inTable('users')
      .onUpdate('cascade')
      .onDelete('cascade');
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
    table.boolean('comments_disabled').defaultTo(false).notNullable();
    table
      .specificType('feed_ids', 'integer[]')
      .defaultTo(knex.raw('ARRAY[]::integer[]'))
      .notNullable();
    table
      .specificType('destination_feed_ids', 'integer[]')
      .defaultTo(knex.raw('ARRAY[]::integer[]'))
      .notNullable();

    table.index('uid', 'posts_uid_idx', 'btree');
    table.index('created_at', 'posts_created_at_idx', 'btree');
    table.index('updated_at', 'posts_updated_at_idx', 'btree');
    table.index('feed_ids', 'posts_feed_ids_idx', 'gin');
    table.index('destination_feed_ids', 'posts_destination_feed_ids_idx', 'gin');
  });

  await knex.schema.createTable('attachments', function (table) {
    table.increments().notNullable().primary();
    table.uuid('uid').defaultTo(knex.raw('gen_random_uuid()')).notNullable().unique();
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
    table.text('file_name');
    table.biginteger('file_size');
    table.text('mime_type');
    table.text('media_type');
    table.text('file_extension');
    table.boolean('no_thumbnail').defaultTo(true).notNullable();
    table.uuid('post_id');
    table.uuid('user_id');
    table.text('artist');
    table.text('title');
    table.text('image_sizes');

    table.index('uid', 'attachments_uid_idx', 'btree');
    table.index('created_at', 'attachments_created_at_idx', 'btree');
    table.index('updated_at', 'attachments_updated_at_idx', 'btree');
    table.index('post_id', 'attachments_post_id_idx', 'btree');
  });

  await knex.schema.createTable('bans', function (table) {
    table.increments().notNullable().primary();
    table
      .uuid('user_id')
      .notNullable()
      .references('uid')
      .inTable('users')
      .onUpdate('cascade')
      .onDelete('cascade');
    table
      .uuid('banned_user_id')
      .notNullable()
      .references('uid')
      .inTable('users')
      .onUpdate('cascade')
      .onDelete('cascade');
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();

    table.index('created_at', 'bans_created_at_idx', 'btree');
    table.index(['user_id', 'banned_user_id'], 'bans_user_id_banned_id_idx', 'btree');
  });

  await knex.schema.createTable('comments', function (table) {
    table.increments().notNullable().primary();
    table.uuid('uid').defaultTo(knex.raw('gen_random_uuid()')).notNullable().unique();
    table.text('body');
    table.uuid('post_id').notNullable();
    table
      .uuid('user_id')
      .notNullable()
      .references('uid')
      .inTable('users')
      .onUpdate('cascade')
      .onDelete('cascade');
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();

    table.index('uid', 'comments_uid_idx', 'btree');
    table.index('created_at', 'comments_created_at_idx', 'btree');
    table.index('updated_at', 'comments_updated_at_idx', 'btree');
    table.index(['post_id', 'user_id'], 'comments_post_user_idx', 'btree');
  });

  await knex.schema.createTable('feeds', function (table) {
    table.increments().notNullable().primary();
    table.uuid('uid').defaultTo(knex.raw('gen_random_uuid()')).notNullable().unique();
    table.text('name').notNullable();
    table.uuid('user_id').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();

    table.index('uid', 'feeds_uid_idx', 'btree');
    table.index('created_at', 'feeds_created_at_idx', 'btree');
    table.index('updated_at', 'feeds_updated_at_idx', 'btree');
    table.index('user_id', 'feeds_user_id_idx', 'btree');
    table.index('name', 'feeds_name_idx', 'btree');
  });

  await knex.schema.createTable('group_admins', function (table) {
    table.increments().notNullable().primary();
    table
      .uuid('group_id')
      .notNullable()
      .references('uid')
      .inTable('users')
      .onUpdate('cascade')
      .onDelete('cascade');
    table
      .uuid('user_id')
      .notNullable()
      .references('uid')
      .inTable('users')
      .onUpdate('cascade')
      .onDelete('cascade');
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();

    table.index('created_at', 'group_admins_created_at_idx', 'btree');
    table.index(['group_id', 'user_id'], 'group_admins_group_id_user_id_idx', 'btree');
  });

  await knex.schema.createTable('likes', function (table) {
    table.increments().notNullable().primary();
    table.uuid('post_id').notNullable();
    table
      .uuid('user_id')
      .notNullable()
      .references('uid')
      .inTable('users')
      .onUpdate('cascade')
      .onDelete('cascade');
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();

    table.index('created_at', 'likes_created_at_idx', 'btree');
    table.index(['post_id', 'user_id'], 'likes_post_id_user_id_idx', 'btree');
  });

  await knex.schema.createTable('local_bumps', function (table) {
    table.increments().notNullable().primary();
    table
      .uuid('post_id')
      .notNullable()
      .references('uid')
      .inTable('posts')
      .onUpdate('cascade')
      .onDelete('cascade');
    table
      .uuid('user_id')
      .notNullable()
      .references('uid')
      .inTable('users')
      .onUpdate('cascade')
      .onDelete('cascade');
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();

    table.index('created_at', 'local_bumps_created_at_idx', 'btree');
    table.index(['post_id', 'user_id'], 'local_bumps_post_id_user_id_idx', 'btree');
  });

  await knex.schema.createTable('subscription_requests', function (table) {
    table.increments().notNullable().primary();
    table
      .uuid('from_user_id')
      .notNullable()
      .defaultTo(knex.raw('gen_random_uuid()'))
      .references('uid')
      .inTable('users')
      .onUpdate('cascade')
      .onDelete('cascade');
    table
      .uuid('to_user_id')
      .notNullable()
      .defaultTo(knex.raw('gen_random_uuid()'))
      .references('uid')
      .inTable('users')
      .onUpdate('cascade')
      .onDelete('cascade');
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();

    table.index('created_at', 'subscription_requests_created_at_idx', 'btree');
    table.index(['from_user_id', 'to_user_id'], 'subscription_requests_from_to_idx', 'btree');
  });

  await knex.schema.createTable('subscriptions', function (table) {
    table.increments().notNullable().primary();
    table
      .uuid('user_id')
      .notNullable()
      .references('uid')
      .inTable('users')
      .onUpdate('cascade')
      .onDelete('cascade');
    table
      .uuid('feed_id')
      .notNullable()
      .references('uid')
      .inTable('feeds')
      .onUpdate('cascade')
      .onDelete('cascade');
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();

    table.index('created_at', 'subscriptions_created_at_idx', 'btree');
    table.index(['feed_id', 'user_id'], 'subscriptions_feed_id_user_id_idx', 'btree');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('subscriptions');

  await knex.schema.dropTableIfExists('subscription_requests');

  await knex.schema.dropTableIfExists('local_bumps');

  await knex.schema.dropTableIfExists('likes');

  await knex.schema.dropTableIfExists('group_admins');

  await knex.schema.dropTableIfExists('feeds');

  await knex.schema.dropTableIfExists('comments');

  await knex.schema.dropTableIfExists('bans');

  await knex.schema.dropTableIfExists('attachments');

  await knex.schema.dropTableIfExists('posts');

  await knex.schema.dropTableIfExists('users');
}
