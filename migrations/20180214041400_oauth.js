async function createProviderConstraint(knex, provider) {
  await knex.raw(`
    CREATE UNIQUE INDEX users_provider_${provider}_id_index ON users((providers->'${provider}'->>'id'))
    WHERE (providers->'${provider}'->>'id') NOTNULL
  `);
}

export async function up(knex) {
  await knex.schema.table('users', (table) => {
    table.jsonb('providers').defaultTo('{}').notNullable();
  });

  await createProviderConstraint(knex, 'facebook');
  await createProviderConstraint(knex, 'google');
  await createProviderConstraint(knex, 'github');
}

export async function down(knex) {
  await knex.schema.table('users', (table) => {
    table.dropColumn('providers');
  });
}
