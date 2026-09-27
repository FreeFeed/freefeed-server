import pgFormat from 'pg-format';
import { type Knex } from 'knex';

const tablesToKeep = ['admin_roles', 'event_types', 'knex_migrations', 'knex_migrations_lock'];

export default async function cleanDB(knex: Knex) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      `Refusing to clean a database with NODE_ENV="${process.env.NODE_ENV ?? ''}"; expected "test". ` +
        `Run tests with NODE_ENV=test.`,
    );
  }

  await knex.raw(
    `
    do $$
      declare
        row record;
      begin
        -- Temp. turn off all triggers
        set session_replication_role = replica;
        for row in 
          select tablename from pg_tables
            where schemaname = 'public' 
              and tablename not in (${pgFormat(`%L`, tablesToKeep)})
        loop
          execute format('delete from %I', row.tablename);
        end loop;
        set session_replication_role = default;
        end
    $$;
  `,
  );
}
