import type { Knex } from 'knex';

export const up = (knex: Knex) =>
  knex.schema.raw(`do $$begin 
        alter table users add column username_tsvector tsvector;
        alter table users add column screen_name_tsvector tsvector;
        alter table users add column description_tsvector tsvector;
        create index users_username_tsvector_idx on users using gin(username_tsvector);
        create index users_screen_name_tsvector_idx on users using gin(screen_name_tsvector);
        create index users_description_tsvector_idx on users using gin(description_tsvector);
    end$$`);

export const down = (knex: Knex) =>
  knex.schema.raw(`do $$begin 
        alter table users drop column username_tsvector;
        alter table users drop column screen_name_tsvector;
        alter table users drop column description_tsvector;
    end$$`);
