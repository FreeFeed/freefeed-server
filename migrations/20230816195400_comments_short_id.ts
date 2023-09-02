import type { Knex } from 'knex';

export const up = (knex: Knex) =>
  knex.schema.raw(`do $$begin
    alter table comments
      add short_id text;
      
    create unique index comments_uid_short_id_unique
      on comments (uid, short_id);
end$$`);

export const down = (knex: Knex) =>
  knex.schema.raw(`do $$begin
    drop index comments_uid_short_id_unique;
  
    alter table comments
      drop column short_id;
end$$`);
