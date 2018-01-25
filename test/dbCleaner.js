export default function cleanDB(knex) {
  return knex.raw(`
    do $$
      declare
        row record;
      begin
        for row in 
          select tablename from pg_tables where schemaname = 'public' 
        loop
          execute format('delete from %I', row.tablename);
        end loop;
      end
    $$;
  `);
}
