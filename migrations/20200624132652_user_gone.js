/**
 * The *gone_status* is null for the active users. If it is not null then the
 * user shows as deleted in any public contexts. Actual values can be:
 *  - 1: user is suspended but can be restored
 *  - 2: user (and their data) is fully deleted
 *
 *  The *gone_at* is null if the *gone_status* is null, otherwise it is the last
 *  time the gone_status changed.
 */
export const up = (knex) => knex.schema.raw(`do $$begin
  alter table users add column gone_status integer;
  alter table users add column gone_at timestamptz;
  alter table users add constraint users_gone_check 
    check ((gone_status is null) = (gone_at is null));

  -- Update gone status for already gone users
  update users set gone_status = 2, gone_at = now() 
    where hashed_password is null or hashed_password = '';
end$$`);

export const down = (knex) => knex.schema.raw(`do $$begin
  alter table users drop constraint users_gone_check;
  alter table users drop column gone_status;
  alter table users drop column gone_at;
end$$`);
