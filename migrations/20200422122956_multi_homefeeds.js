export async function up(knex) {
  await knex.schema
    .raw('alter table feeds add column title text')
    .raw('alter table feeds add column ord integer')
    .raw(`alter table feeds drop constraint feeds_unique_feed_names`)
    // Only RiverOfNews feeds can have non-NULL ord or title
    .raw(`alter table feeds add constraint feeds_names_chk
      check (ord is null and title is null or name = 'RiverOfNews')`)
    // User cannot have multiple feeds with same name and ord is NULL
    .raw(`create unique index feeds_unique_names_idx on feeds (user_id, name) where ord is null`)
}

export async function down(knex) {
  // TODO: move extra subscriptions to main feed?
  await knex.schema
    // Remove extra RiverOfNews feeds
    .raw(`delete from feeds where name = 'RiverOfNews' and ord is not null`)
    .raw(`drop index feeds_unique_names_idx`)
    .raw('alter table feeds drop constraint feeds_names_chk')
    .raw('alter table feeds drop column title')
    .raw('alter table feeds drop column ord')
    .raw(`alter table feeds add constraint feeds_unique_feed_names unique(user_id, name)`);
}
