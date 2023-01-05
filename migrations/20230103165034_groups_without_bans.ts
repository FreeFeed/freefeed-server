import Knex from 'knex';

export const up = (knex: Knex) =>
  knex.schema.raw(`do $$begin
  create table groups_without_bans (
    user_id uuid not null
      references users (uid) on delete cascade on update cascade,
    group_id uuid not null
      references users (uid) on delete cascade on update cascade,

    primary key (user_id, group_id)
  );
  end$$`);

export const down = (knex: Knex) =>
  knex.schema.raw(`do $$begin
  drop table groups_without_bans;
  end$$`);
