export const up = (knex) =>
  knex.schema.raw(`do $$begin
  create table group_blocks (
    group_id uuid not null
      references users (uid) on delete cascade on update cascade,
    blocked_user_id uuid not null
      references users (uid) on delete cascade on update cascade,
    created_at timestamptz not null default now(),
    
    primary key (group_id, blocked_user_id)
  );

  -- Add new event types
  ALTER TABLE events DROP CONSTRAINT events_event_type_check;
  ALTER TABLE events
  ADD CONSTRAINT events_event_type_check CHECK (event_type = ANY (ARRAY[
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
    'invitation_used'::text,
    'backlink_in_post'::text,
    'backlink_in_comment'::text,
    'direct_left'::text,

    -- NEW LINES --
    'blocked_in_group'::text,
    'unblocked_in_group'::text
  ]));

end$$`);

export const down = (knex) =>
  knex.schema.raw(`do $$begin
  drop table group_blocks;

  ALTER TABLE events DROP CONSTRAINT events_event_type_check;
  ALTER TABLE events
    ADD CONSTRAINT events_event_type_check CHECK (event_type = ANY (ARRAY[
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
      'invitation_used'::text,
      'backlink_in_post'::text,
      'backlink_in_comment'::text,
      'direct_left'::text
    ]));
end$$`);
