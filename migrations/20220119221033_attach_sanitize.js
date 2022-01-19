export const up = (knex) =>
  knex.schema.raw(`do $$begin
  alter table "attachments" add column "sanitized" int not null default 0;
end$$`);

export const down = (knex) =>
  knex.schema.raw(`do $$begin
  alter table "attachments" drop column "sanitized";
end$$`);
