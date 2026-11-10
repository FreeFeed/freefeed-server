import { type Knex } from 'knex';
import { describe, it } from 'mocha';
import expect from 'unexpected';

import cleanDB from '../dbCleaner';

describe('database cleaner', () => {
  it('refuses to clean outside the test environment', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      await expect(
        () =>
          cleanDB({ raw: () => Promise.reject(new Error('Unexpected query')) } as unknown as Knex),
        'to be rejected with',
        /expected "test"/,
      );
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  it('keeps migration tables', async () => {
    const queries: string[] = [];
    const knex = {
      raw: (query: string) => {
        queries.push(query);
        return Promise.resolve();
      },
    } as unknown as Knex;

    await cleanDB(knex);

    expect(queries, 'to have length', 1);
    expect(queries[0], 'to contain', "'knex_migrations'");
    expect(queries[0], 'to contain', "'knex_migrations_lock'");
  });
});
