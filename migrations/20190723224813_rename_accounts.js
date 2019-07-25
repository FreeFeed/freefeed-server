export async function up(knex) {
  await knex.raw(`
    create table user_past_names (
      id serial not null primary key,
      user_id uuid not null
        references users (uid) on delete cascade on update cascade,
      username text not null,
      valid_till timestamptz default now()
    )
  `);
  await knex.raw('create index user_past_names_user_id_idx on user_past_names using btree (user_id)');
  await knex.raw('create index user_past_names_username_idx on user_past_names using btree (username)');
}

export async function down(knex) {
  await knex.raw(`drop table user_past_names`);
}
