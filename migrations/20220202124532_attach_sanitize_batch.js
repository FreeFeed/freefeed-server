export const up = (knex) =>
  knex.schema.raw(`do $$begin
  create table attachments_sanitize_task (
    user_id uuid not null primary key
      references users (uid) on delete cascade on update cascade,
    created_at timestamptz not null default now()
  );
end$$`);

export const down = (knex) =>
  knex.schema.raw(`do $$begin
  drop table attachments_sanitize_task;
end$$`);
