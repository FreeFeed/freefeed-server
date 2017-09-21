export async function up(knex) {
  await knex.schema.table('users', (table) => {
    table.jsonb('preferences').defaultTo('{}').notNullable();
  });
  // Migrate from the 'frontend_preferences'
  await knex.raw(`
    update users set 
      preferences = jsonb_set(
          preferences, '{hideCommentsOfTypes}',
          coalesce(frontend_preferences::jsonb #> '{net.freefeed,comments,hiddenTypes}', '[]'),
          true
        ),
      frontend_preferences = (
        frontend_preferences::jsonb #- '{net.freefeed,comments,hiddenTypes}'
      )::text
  `);
}

export async function down(knex) {
  // Migrate back to the 'frontend_preferences'
  await knex.raw(`
    update users set 
      frontend_preferences = jsonb_set(
          frontend_preferences::jsonb, '{net.freefeed,comments,hiddenTypes}',
          coalesce(preferences #> '{hideCommentsOfTypes}', '[]'),
          true
        )::text
  `);
  await knex.schema.table('users', (table) => {
    table.dropColumn('preferences');
  });
}
