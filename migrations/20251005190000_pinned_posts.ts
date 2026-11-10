// See 20251005… migration for the name issue

import type { Knex } from 'knex';

import { eventTypesSQLs } from '../app/support/migrations';

const [eventTypesUp, eventTypesDown] = eventTypesSQLs(
  'post_pinned_in_group',
  'post_unpinned_in_group',
  'post_pinned_in_profile',
  'post_unpinned_in_profile',
);

// Consolidated migration for pins feature: creates table and event types
export const up = async (knex: Knex) => {
  // Create final version of pinned_posts table using feed_id + post_id PK and non-null pinned_by
  await knex.schema.raw(`do $$begin
    create table if not exists pinned_posts (
      feed_id    uuid not null references feeds (uid) on delete cascade on update cascade,
      post_id    uuid not null references posts (uid) on delete cascade on update cascade,
      pinned_by  uuid not null references users (uid) on delete cascade on update cascade,
      created_at timestamptz not null default now(),
      primary key (feed_id, post_id)
    );
  end$$`);

  // Useful indexes for fast lookups and ordering
  await knex.schema.raw(`do $$begin
    create index if not exists pinned_posts_post_id_idx on pinned_posts (post_id);
    create index if not exists pinned_posts_feed_created_idx on pinned_posts (feed_id, created_at);
  end$$`);

  // Register event types for pin/unpin notifications
  await knex.schema.raw(`do $$begin
    ${eventTypesUp}
  end$$`);
};

export const down = async (knex: Knex) => {
  await knex.schema.raw(`do $$begin
    drop table if exists pinned_posts;
  end$$`);

  await knex.schema.raw(`do $$begin
    ${eventTypesDown}
  end$$`);
};
