import type { Knex } from 'knex';

import { eventTypesSQLs } from '../app/support/migrations';

const [eventTypesUp, eventTypesDown] = eventTypesSQLs(
  `post_comment`,
  `post_comments_subscribe`,
  `post_comments_unsubscribe`,
);

export const up = (knex: Knex) =>
  knex.schema.raw(`do $$begin

  create table user_post_events (
    user_id uuid not null
      references users (uid) on delete cascade on update cascade,
    post_id uuid not null
      references posts (uid) on delete cascade on update cascade,
    is_enabled boolean not null,
    
    primary key (user_id, post_id)
  );

  -- Add event types
  ${eventTypesUp}
  end$$`);

export const down = (knex: Knex) =>
  knex.schema.raw(`do $$begin

  drop table user_post_events;

  -- Remove event types
  ${eventTypesDown}
  end$$`);
