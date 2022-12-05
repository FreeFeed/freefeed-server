export const up = (knex) =>
  knex.schema.raw(`do $$begin
  create table email_verification_codes (
    code text not null,
    email text not null,
    email_norm text not null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default now() + interval '1 hour',
    creator_ip inet not null,
    
    primary key (code, email)
  );

  alter table users add column email_norm text;

  end$$`);

export const down = (knex) =>
  knex.schema.raw(`do $$begin
  drop table email_verification_codes;
  alter table users drop column email_norm;
  end$$`);
