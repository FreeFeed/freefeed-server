export async function up(knex) {
  // Remove duplicates 
  // see https://stackoverflow.com/a/26769694 
  await knex.raw(` 
  delete from local_bumps t1 
    where exists ( 
      select 1 from local_bumps t2 
      where t1.post_id = t2.post_id 
        and t1.user_id = t2.user_id 
        and t1.id > t2.id 
    ); 
  `);
  await knex.schema.table('local_bumps', (table) => table.unique(['user_id', 'post_id']));
  await knex.schema
    .table('local_bumps', (table) => {
      table.index('user_id', 'local_bumps_user_id_idx');
    });
}

export async function down(knex) {
  await knex.schema
    .table('local_bumps', (table) => {
      table.dropIndex('', 'local_bumps_user_id_idx');
    });
  await knex.schema.table('local_bumps', (table) => table.dropUnique(['user_id', 'post_id']));
}
