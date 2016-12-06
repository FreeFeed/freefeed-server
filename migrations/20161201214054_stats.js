export async function up(knex, Promise) {
  return Promise.all([
    knex.schema.createTable('stats', function(table) {
      table.increments().notNullable().primary();
      table.timestamp('dt').notNullable();
      table.text('metric').notNullable();
      table.biginteger('value').unsigned();
      table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
      table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();

      table.unique(['dt','metric'], 'dt_metric', 'btree');
    }),

    knex.raw('CREATE EXTENSION IF NOT EXISTS tablefunc'),
  ]);
};

export async function down(knex, Promise) {
  return Promise.all([
    knex.schema.dropTableIfExists('stats'),
    knex.raw('DROP EXTENSION IF EXISTS tablefunc'),
  ]);
};
