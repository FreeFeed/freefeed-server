export const up = (knex) =>
  knex.schema.raw(`do $$begin
  alter table users add column invitation_id integer
    references invitations (id) on delete cascade on update cascade;
  
  alter table users add column sys_preferences jsonb;
  comment on column users.sys_preferences is
    'Set of user props for internal (system) use. This data is not directly visible from the outside.';
  end$$`);

export const down = (knex) =>
  knex.schema.raw(`do $$begin
  alter table users drop column invitation_id;
  alter table users drop column sys_preferences;
  end$$`);
