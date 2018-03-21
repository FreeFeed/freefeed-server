export async function up(knex) {
  // This unique indexes prevents app from inserting
  // repeated events of the same type on the same
  // object (post, comment) and for the same recipient

  // We can skip the duplicates removal step
  // because before this commit all events were
  // created only once by post/comment

  await knex.raw(
    `create unique index events_unique_mention_in_comment_idx
      on events (comment_id, user_id)
      where event_type in ('mention_in_comment', 'mention_comment_to');`
  );
  await knex.raw(
    `create unique index events_unique_direct_comment_idx
      on events (comment_id, user_id)
      where event_type = 'direct_comment';`
  );
  await knex.raw(
    `create unique index events_unique_mention_in_post_idx
      on events (post_id, user_id)
      where event_type = 'mention_in_post';`
  );
  await knex.raw(
    `create unique index events_unique_direct_idx
      on events (post_id, user_id)
      where event_type = 'direct';`
  );
}

export async function down(knex) {
  await knex.raw(`drop index events_unique_mention_in_comment_idx;`);
  await knex.raw(`drop index events_unique_direct_comment_idx;`);
  await knex.raw(`drop index events_unique_mention_in_post_idx;`);
  await knex.raw(`drop index events_unique_direct_idx;`);
}
