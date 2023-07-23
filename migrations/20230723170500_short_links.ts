import type { Knex } from 'knex';

export const up = (knex: Knex) =>
  knex.schema.raw(`do $$begin
  create table post_short_ids (
    short_id text primary key,
    long_id uuid unique references posts (uid) on update cascade on delete set null
  );
end$$`);

export const down = (knex: Knex) =>
  knex.schema.raw(`do $$begin
    drop table post_short_ids;
end$$`);
