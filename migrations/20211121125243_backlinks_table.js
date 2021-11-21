export const up = (knex) =>
  knex.schema.raw(`do $$begin
  create table backlinks (
    -- Mentioned post
    post_id uuid not null references posts (uid) on delete cascade on update cascade,
    
    -- Post that mention the post_id
    ref_post_id uuid not null references posts (uid) on delete cascade on update cascade,

    -- Comment that mention the post_id
    -- If it is NULL, then the mention is in the post body
    ref_comment_id uuid references comments (uid) on delete cascade on update cascade
  );

  -- Covers the whole table and checks the uniqueness of mentions in comments
  -- It doesn't check uniqueness when ref_comment_id is NULL
  create unique index backlinks_ids_idx on backlinks 
    (post_id, ref_post_id, ref_comment_id);

  -- Checks the uniqueness of mentions in post bodies
  create unique index backlinks_post_ids_idx on backlinks 
    (post_id, ref_post_id)
    where ref_comment_id is null;
end$$`);

export const down = (knex) =>
  knex.schema.raw(`do $$begin
    drop table backlinks;
end$$`);
