import type { Knex } from 'knex';

export const up = (knex: Knex) =>
  knex.raw(`do $$begin
  create table translation_usage (
    -- null user_id means service-wide limit
    user_id     uuid  references users (uid) on delete cascade on update cascade,
    period      text  not null check (period in ('day', 'month')),
    date        date  not null,
    characters  int   not null default 0,
    
    unique (user_id, period, date)
  );
end$$`);

export const down = (knex: Knex) =>
  knex.raw(`do $$begin
  drop table translation_usage;
end$$`);
