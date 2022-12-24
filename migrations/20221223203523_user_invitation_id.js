export const up = (knex) =>
  knex.schema.raw(`do $$begin
  alter table users add column invitation_id integer
    references invitations (id) on delete cascade on update cascade;
  end$$`);

export const down = (knex) =>
  knex.schema.raw(`do $$begin
  alter table users drop column invitation_id;
  end$$`);
