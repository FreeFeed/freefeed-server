export async function up(knex) {
  await knex.schema.table('subscriptions', (table) => table.index('user_id', 'subscriptions_user_id_idx', 'btree'));
  await knex.schema.table('bans', (table) => table.index('user_id', 'bans_user_id_idx', 'btree'));
  await knex.schema.table('subscription_requests', (table) => table.index('to_user_id', 'subscription_requests_to_user_id_idx', 'btree'));
  await knex.schema.table('group_admins', (table) => table.index('user_id', 'group_admins_user_id_idx', 'btree'));
}

export async function down(knex) {
  await knex.schema.table('subscriptions', (table) => table.dropIndex('', 'subscriptions_user_id_idx'));
  await knex.schema.table('bans', (table) => table.dropIndex('', 'bans_user_id_idx'));
  await knex.schema.table('subscription_requests', (table) => table.dropIndex('', 'subscription_requests_to_user_id_idx'));
  await knex.schema.table('group_admins', (table) => table.dropIndex('', 'group_admins_user_id_idx'));
}
