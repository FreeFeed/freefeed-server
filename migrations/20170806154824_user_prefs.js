export async function up(knex) {
  await knex.schema.table('users', (table) => {
    table.jsonb('preferences').defaultTo('{}').notNullable();
  });
  // Migrate from the 'frontend_preferences'
  await knex.raw(`
    update users set preferences = jsonb_set(
      preferences,
      '{hideCommentsOfTypes}',
      coalesce((frontend_preferences::jsonb) #> '{net.freefeed,comments,hiddenTypes}', '[]'),
      true
    )
  `);
}

export async function down(knex) {
  await knex.schema.table('users', (table) => {
    table.dropColumn('preferences');
  });
}
