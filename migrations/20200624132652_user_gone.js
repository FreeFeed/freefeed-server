import { GONE_DELETED } from '../app/models/user';

/**
 * The *gone_status* is null for the active users. If it is not null then the
 * user shows as deleted in any public contexts.
 *
 *  The *gone_at* is null if the *gone_status* is null, otherwise it is the last
 *  time the gone_status changed.
 */
export const up = (knex) => knex.schema.raw(`do $$begin
  alter table users add column gone_status integer;
  alter table users add column gone_at timestamptz;
  alter table users add constraint users_gone_check 
    check ((gone_status is null) = (gone_at is null));
  create index users_gone_status_not_null_idx on users ((gone_status is null));

  -- Update gone status for already gone users
  update users set gone_status = ${GONE_DELETED}, gone_at = updated_at
    where type='user' and (hashed_password is null or hashed_password = '');
  
  -- Restore previously deleted feeds of gone users
  insert into feeds (name, user_id)
    select names.name, users.uid
    from users, (values
      ('RiverOfNews'),
      ('Hides'),
      ('Comments'),
      ('Likes'),
      ('Posts'),
      ('Directs'),
      ('MyDiscussions'),
      ('Saves')
    ) as names (name)
    where
      users.type = 'user' and users.gone_status is not null
  on conflict do nothing;

end$$`);

export const down = (knex) => knex.schema.raw(`do $$begin
  alter table users drop constraint users_gone_check;
  alter table users drop column gone_status;
  alter table users drop column gone_at;
end$$`);
