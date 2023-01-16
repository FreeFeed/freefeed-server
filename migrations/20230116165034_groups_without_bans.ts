import { Knex } from 'knex';

import { eventTypesSQLs } from '../app/support/migrations';

const [eventTypesUp, eventTypesDown] = eventTypesSQLs(
  'bans_in_group_disabled',
  'bans_in_group_enabled',
);

export const up = (knex: Knex) =>
  knex.schema.raw(`do $$begin
  create table groups_without_bans (
    user_id uuid not null
      references users (uid) on delete cascade on update cascade,
    group_id uuid not null
      references users (uid) on delete cascade on update cascade,

    primary key (user_id, group_id)
  );

  -- Add event types
  ${eventTypesUp}
  end$$`);

export const down = (knex: Knex) =>
  knex.schema.raw(`do $$begin
  drop table groups_without_bans;

  -- Remove event types
  ${eventTypesDown}
  end$$`);
