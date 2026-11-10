export async function up(knex) {
  await knex.schema.createTable('stats', function (table) {
    table.increments().notNullable().primary();
    table.timestamp('dt').notNullable();
    table.text('metric').notNullable();
    table.biginteger('value').unsigned();
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();

    table.unique(['dt', 'metric'], 'dt_metric', 'btree');
  });

  await knex.raw('CREATE EXTENSION IF NOT EXISTS tablefunc');
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('stats');

  await knex.raw('DROP EXTENSION IF EXISTS tablefunc');
}
