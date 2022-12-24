export const up = (knex) =>
  knex.schema.raw(`do $$begin
  create table frozen_users (
    user_id uuid not null primary key
      references users (uid) on delete cascade on update cascade,
    created_at timestamptz not null default now(),
    expires_at timestamptz
  );
  end$$`);

export const down = (knex) =>
  knex.schema.raw(`do $$begin
  drop table frozen_users;
  end$$`);
