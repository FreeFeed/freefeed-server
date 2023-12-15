import type { Knex } from 'knex';

export const up = (knex: Knex) =>
  knex.schema.raw(`do $$begin

  -- Delete likes that have no posts
  delete from likes where post_id not in (select uid from posts);

  alter table likes add constraint fk_likes_post_id foreign key (post_id)
    references posts (uid)
    on delete cascade on update cascade;

  -- Delete feeds that have no users
  delete from feeds where user_id not in (select uid from users);

  alter table feeds add constraint fk_feeds_user_id foreign key (user_id)
    references users (uid)
    on delete cascade on update cascade;

  end$$`);

export const down = (knex: Knex) =>
  knex.schema.raw(`do $$begin

  alter table likes drop constraint fk_likes_post_id;
  alter table feeds drop constraint fk_feeds_user_id;

  end$$`);
