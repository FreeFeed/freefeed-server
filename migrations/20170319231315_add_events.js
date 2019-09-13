export async function up(knex) {
  await knex.schema.createTable('events', (table) => {
    table
      .increments()
      .notNullable()
      .primary();
    table
      .timestamp('created_at')
      .defaultTo(knex.fn.now())
      .notNullable();
    table
      .integer('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onUpdate('cascade')
      .onDelete('cascade');
    table
      .enu('event_type', [
        'mention_in_post',
        'mention_in_comment',
        'mention_comment_to',
        'banned_user',
        'unbanned_user',
        'banned_by_user',
        'unbanned_by_user',
        'subscription_requested',
        'subscription_request_revoked',
        'user_subscribed',
        'user_unsubscribed',
        'subscription_request_approved',
        'subscription_request_rejected',
        'group_created',
        'group_subscription_requested',
        'group_subscription_request_revoked',
        'group_subscription_rejected',
        'group_subscribed',
        'group_unsubscribed',
        'group_admin_promoted',
        'group_admin_demoted',
        'group_subscription_approved',
        'group_subscription_rejected',
        'direct',
        'direct_comment',
      ])
      .notNullable();
    table.integer('created_by_user_id');
    table.integer('target_user_id');
    table.integer('group_id');
    table.integer('post_id');
    table.integer('comment_id');

    table.index('created_at', 'events_created_at_idx', 'btree');
    table.index('user_id', 'events_user_id_idx', 'btree');
    table.index('event_type', 'events_event_type_idx', 'btree');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('events');
}
