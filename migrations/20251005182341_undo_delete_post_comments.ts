// MIGRATION NAME ISSUE
//
// This migration was named incorrectly (it should be `20250510…` instead of
// `20251005…`), but it has been applied to the database. So we need to keep the
// following migrations names greater than it until October 5th 2025.

import type { Knex } from 'knex';

import { eventTypesSQLs } from '../app/support/migrations';

const [eventTypesUp, eventTypesDown] = eventTypesSQLs(
  `post_restored`,
  `post_restored_by_another_admin`,
  `comment_restored`,
  `comment_restored_by_another_admin`,
);

export const up = (knex: Knex) =>
  knex.schema.raw(`do $$begin
  alter table posts add column to_delete boolean not null default false;
  create index posts_to_delete_idx on posts (to_delete);

  alter table comments add column to_delete boolean not null default false;
  create index comments_to_delete_idx on comments (to_delete);

  -- Add event types
  ${eventTypesUp}
end$$`);

export const down = (knex: Knex) =>
  knex.schema.raw(`do $$begin
  alter table posts drop column to_delete;
  alter table comments drop column to_delete;

  -- Remove event types
  ${eventTypesDown}
end$$`);
