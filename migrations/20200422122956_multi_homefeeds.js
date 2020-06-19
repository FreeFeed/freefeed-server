export const up = (knex) => knex.schema.raw(`do $$begin
  -- FEEDS TABLE
  alter table feeds add column title text;
  alter table feeds add column ord integer;
  alter table feeds drop constraint feeds_unique_feed_names;

  -- Only RiverOfNews feeds can have non-NULL ord or title
  alter table feeds add constraint feeds_names_chk 
    check (ord is null and title is null or name = 'RiverOfNews');

  -- User cannot have multiple feeds with same name and ord is NULL
  create unique index feeds_unique_names_idx on feeds (user_id, name) where ord is null;

  -- HOMEFEED_SUBSCRIPTIONS TABLE
  create table homefeed_subscriptions (
    homefeed_id uuid not null
      references feeds (uid) on delete cascade on update cascade,
    target_user_id uuid not null
      references users (uid) on delete cascade on update cascade,
    primary key (homefeed_id, target_user_id)
  );
  create index homefeed_subscriptions_target_user_id_idx 
    on homefeed_subscriptions using btree (target_user_id);

  -- Assign all existing subscriptions to the main users homefeeds
  insert into homefeed_subscriptions (homefeed_id, target_user_id)
  select h.uid, f.user_id from
    subscriptions s
      join feeds h on h.user_id = s.user_id and h.name = 'RiverOfNews'
      join feeds f on f.uid = s.feed_id and f.name = 'Posts';

  -- SUBSCRIPTION_REQUESTS TABLE
  alter table subscription_requests add column homefeed_ids uuid[] not null default '{}';
  alter table subscription_requests add constraint subscription_requests_user_ids_unique
    unique (from_user_id, to_user_id);
    
end$$`);

export const down = (knex) => knex.schema.raw(`do $$begin
  -- SUBSCRIPTION_REQUESTS TABLE
  alter table subscription_requests drop constraint subscription_requests_user_ids_unique;
  alter table subscription_requests drop column homefeed_ids;
  
  -- HOMEFEED_SUBSCRIPTIONS TABLE
    drop table homefeed_subscriptions;

  -- FEEDS TABLE
  -- Remove extra RiverOfNews feeds
  delete from feeds where name = 'RiverOfNews' and ord is not null;
  drop index feeds_unique_names_idx;
  alter table feeds drop constraint feeds_names_chk;
  alter table feeds drop column title;
  alter table feeds drop column ord;
  alter table feeds add constraint feeds_unique_feed_names unique(user_id, name);

end$$`);
