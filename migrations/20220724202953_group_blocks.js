export const up = (knex) =>
  knex.schema.raw(`do $$begin
  create table group_blocks (
    group_id uuid not null
      references users (uid) on delete cascade on update cascade,
    blocked_user_id uuid not null
      references users (uid) on delete cascade on update cascade,
    created_at timestamptz not null default now(),
    
    primary key (group_id, blocked_user_id)
  );
end$$`);

export const down = (knex) =>
  knex.schema.raw(`do $$begin
  drop table group_blocks;
end$$`);
