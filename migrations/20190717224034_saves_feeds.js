export async function up(knex) {
  await knex.raw(`insert into feeds (user_id, name)
    select uid, 'Saves' from users where type = 'user'`);
}

export async function down(knex) {
  await knex.raw(`delete from feeds where name = 'Saves'`);
}
