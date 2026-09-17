import type { Knex } from 'knex';

export const up = (knex: Knex) =>
  knex.schema.raw(`do $$begin
    alter table users add column first_interaction_at timestamptz;
    update users set first_interaction_at = created_at where type = 'user' and first_interaction_at is null;
end$$`);

export const down = (knex: Knex) =>
  knex.schema.raw(`do $$begin
    alter table users drop column first_interaction_at;
end$$`);
