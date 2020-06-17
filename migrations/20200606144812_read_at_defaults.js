export const up = (knex) => knex.schema.raw(`do $$begin
  update users set notifications_read_at = created_at where notifications_read_at is null;
  alter table users alter column notifications_read_at set default now();
  alter table users alter column notifications_read_at set not null;

  update users set directs_read_at = created_at where directs_read_at is null;
  alter table users alter column directs_read_at set default now();
  alter table users alter column directs_read_at set not null;
end$$`);

export const down = (knex) => knex.schema.raw(`do $$begin
  alter table users alter column notifications_read_at drop not null;
  alter table users alter column notifications_read_at drop default;

  alter table users alter column directs_read_at drop not null;
  alter table users alter column directs_read_at drop default;
end$$`);
