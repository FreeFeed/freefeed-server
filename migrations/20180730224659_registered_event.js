export async function up(knex) {
  await knex.raw('ALTER TABLE events DROP CONSTRAINT events_event_type_check');
  await knex.raw(`ALTER TABLE events ADD CONSTRAINT events_event_type_check CHECK (event_type = ANY (ARRAY[
    'mention_in_post'::text,
    'mention_in_comment'::text,
    'mention_comment_to'::text,
    'banned_user'::text,
    'unbanned_user'::text,
    'banned_by_user'::text,
    'unbanned_by_user'::text,
    'subscription_requested'::text,
    'subscription_request_revoked'::text,
    'user_subscribed'::text,
    'user_unsubscribed'::text,
    'subscription_request_approved'::text,
    'subscription_request_rejected'::text,
    'group_created'::text,
    'group_subscription_requested'::text,
    'group_subscription_request_revoked'::text,
    'group_subscription_rejected'::text,
    'group_subscribed'::text,
    'group_unsubscribed'::text,
    'group_admin_promoted'::text,
    'group_admin_demoted'::text,
    'group_subscription_approved'::text,
    'group_subscription_rejected'::text,
    'direct'::text,
    'direct_comment'::text,
    'managed_group_subscription_approved'::text,
    'managed_group_subscription_rejected'::text,
    'comment_moderated'::text,
    'comment_moderated_by_another_admin'::text,
    'post_moderated'::text,
    'post_moderated_by_another_admin'::text,

    'invitation_used'::text
    ]))`);
}

export async function down(knex) {
  await knex.raw(`delete from events where event_type ='invitation_used'`);
  await knex.raw('ALTER TABLE events DROP CONSTRAINT events_event_type_check');
  await knex.raw(`ALTER TABLE events ADD CONSTRAINT events_event_type_check CHECK (event_type = ANY (ARRAY[
    'mention_in_post'::text,
    'mention_in_comment'::text,
    'mention_comment_to'::text,
    'banned_user'::text,
    'unbanned_user'::text,
    'banned_by_user'::text,
    'unbanned_by_user'::text,
    'subscription_requested'::text,
    'subscription_request_revoked'::text,
    'user_subscribed'::text,
    'user_unsubscribed'::text,
    'subscription_request_approved'::text,
    'subscription_request_rejected'::text,
    'group_created'::text,
    'group_subscription_requested'::text,
    'group_subscription_request_revoked'::text,
    'group_subscription_rejected'::text,
    'group_subscribed'::text,
    'group_unsubscribed'::text,
    'group_admin_promoted'::text,
    'group_admin_demoted'::text,
    'group_subscription_approved'::text,
    'group_subscription_rejected'::text,
    'direct'::text,
    'direct_comment'::text,
    'managed_group_subscription_approved'::text,
    'managed_group_subscription_rejected'::text,
    'comment_moderated'::text,
    'comment_moderated_by_another_admin'::text,
    'post_moderated'::text,
    'post_moderated_by_another_admin'::text
    ]))`);
}
