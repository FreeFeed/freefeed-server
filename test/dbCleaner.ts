import pgFormat from 'pg-format';
import { type Knex } from 'knex';

const tablesToKeep = ['admin_roles'];

export default function cleanDB(knex: Knex) {
  return knex.raw(
    `
    do $$
      declare
        row record;
      begin
        for row in 
          select tablename from pg_tables
            where schemaname = 'public' 
              and tablename not in (${pgFormat(`%L`, tablesToKeep)})
        loop
          execute format('delete from %I', row.tablename);
        end loop;
      end
    $$;
  `,
  );
}
