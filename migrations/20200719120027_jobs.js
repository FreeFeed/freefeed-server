export const up = (knex) => knex.schema.raw(`do $$begin
  create table jobs (
    id uuid not null default gen_random_uuid() primary key,
    created_at timestamptz not null default now(),
    unlock_at timestamptz not null default now(),
    attempts int not null default 0,

    -- Job name and payload
    name text not null,
    payload jsonb not null default '{}'
  ) with (
    fillfactor=70
  );

  create index idx_job_unlock_at on jobs using btree (unlock_at);
end$$`);

export const down = (knex) => knex.schema.raw(`do $$begin
    drop table jobs;
end$$`);
