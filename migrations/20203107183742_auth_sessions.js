export const up = (knex) => knex.schema.raw(`do $$begin
  create table auth_sessions (
    uid uuid not null default gen_random_uuid() primary key,
    user_id uuid not null references users (uid) on delete cascade on update cascade,
    issue integer not null default 1,
    status integer not null default 0,
    -- Create/update times
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    -- Last usage of session
    last_used_at timestamptz,
    last_ip inet,
    last_user_agent text
  );
end$$`);

export const down = (knex) => knex.schema.raw(`do $$begin
    drop table auth_sessions;
end$$`);
