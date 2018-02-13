export async function up(knex) {
  // Remove duplicates
  // see https://stackoverflow.com/a/26769694
  await knex.raw(` 
  delete from subscriptions t1 
    where exists ( 
      select 1 from subscriptions t2 
      where t1.feed_id = t2.feed_id 
        and t1.user_id = t2.user_id 
        and t1.id > t2.id 
    ); 
  `);
  await knex.schema.table('subscriptions', (table) => table.unique(['user_id', 'feed_id']));
}

export async function down(knex) {
  await knex.schema.table('subscriptions', (table) => table.dropUnique(['user_id', 'feed_id']));
}
