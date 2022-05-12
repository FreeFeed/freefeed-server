export const up = (knex) =>
  knex.schema.raw(`do $$begin
  -- How many times this job has been failed
  alter table jobs add column failures int not null default 0;
end$$`);

export const down = (knex) =>
  knex.schema.raw(`do $$begin
  alter table jobs drop column failures;
end$$`);
