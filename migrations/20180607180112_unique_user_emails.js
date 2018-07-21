export async function up(knex) {
  await knex.raw(`update users set email = null where email = ''`);
  await knex.raw(`alter table users add constraint users_email_unique unique(email)`);
}

export async function down(knex) {
  await knex.raw(`alter table users drop constraint users_email_unique`);
}
