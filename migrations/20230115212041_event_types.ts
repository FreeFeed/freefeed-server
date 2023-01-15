import type { Knex } from 'knex';

export const up = (knex: Knex) =>
  knex.schema.raw(`do $$begin
      create table event_types (
        event_type text not null primary key
      );

      -- Initial roles
      insert into event_types (event_type) values
        ('mention_in_post'),
        ('mention_in_comment'),
        ('mention_comment_to'),
        ('banned_user'),
        ('unbanned_user'),
        ('banned_by_user'),
        ('unbanned_by_user'),
        ('subscription_requested'),
        ('subscription_request_revoked'),
        ('user_subscribed'),
        ('user_unsubscribed'),
        ('subscription_request_approved'),
        ('subscription_request_rejected'),
        ('group_created'),
        ('group_subscription_requested'),
        ('group_subscription_request_revoked'),
        ('group_subscribed'),
        ('group_unsubscribed'),
        ('group_admin_promoted'),
        ('group_admin_demoted'),
        ('group_subscription_approved'),
        ('group_subscription_rejected'),
        ('direct'),
        ('direct_comment'),
        ('managed_group_subscription_approved'),
        ('managed_group_subscription_rejected'),
        ('comment_moderated'),
        ('comment_moderated_by_another_admin'),
        ('post_moderated'),
        ('post_moderated_by_another_admin'),
        ('invitation_used'),
        ('backlink_in_post'),
        ('backlink_in_comment'),
        ('direct_left'),
        ('blocked_in_group'),
        ('unblocked_in_group');

      alter table events drop constraint events_event_type_check;
      alter table events add constraint fk_event_type foreign key (event_type)
        references event_types (event_type)
        on delete restrict on update cascade;
  end$$`);

export const down = (knex: Knex) =>
  knex.schema.raw(`do $$begin
    alter table events drop constraint fk_event_type;
    drop table event_types;

    alter table events
    add constraint events_event_type_check check (event_type = any (array[
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
      'blocked_in_group'::text,
      'unblocked_in_group'::text
    ]));
  end$$`);
