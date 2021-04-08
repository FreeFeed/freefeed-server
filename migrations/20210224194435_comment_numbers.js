export const up = (knex) =>
  knex.schema.raw(`do $$begin
  alter table "comments" add column "seq_number" int not null default 0;
end$$`);

export const down = (knex) =>
  knex.schema.raw(`do $$begin
  alter table "comments" drop column "seq_number";
end$$`);
