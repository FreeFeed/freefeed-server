export const up = (knex) =>
  knex.schema.raw(`do $$begin
  ALTER TABLE events ADD COLUMN target_post_id uuid;
  ALTER TABLE events ADD COLUMN target_comment_id uuid;

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

      -- NEW LINES --
      'backlink_in_post'::text,
      'backlink_in_comment'::text
    ]));

    CREATE UNIQUE INDEX events_unique_backlink_in_post_idx
      ON events (post_id, target_post_id, target_comment_id)
      WHERE event_type = 'backlink_in_post';

    CREATE UNIQUE INDEX events_unique_backlink_in_comment_idx
      ON events (comment_id, target_post_id, target_comment_id)
      WHERE event_type = 'backlink_in_comment';
end$$`);

export const down = (knex) =>
  knex.schema.raw(`do $$begin
  DROP INDEX events_unique_backlink_in_post_idx;
  DROP INDEX events_unique_backlink_in_comment_idx;

  ALTER TABLE events DROP COLUMN target_post_id;
  ALTER TABLE events DROP COLUMN target_comment_id;

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
      'invitation_used'::text
    ]));
end$$`);
