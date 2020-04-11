import { program } from 'commander';

import { dbAdapter } from '../app/models';
import { toTSVector } from '../app/support/search/to-tsvector';

// Reindex search columns in 'posts' and 'comments' tables.
// Usage: yarn babel-node bin/reindex_search.js --help

program
  .option('--batch-size <batch size>', 'batch size', (v) => parseInt(v, 10), '1000')
  .option('--delay <delay>', 'delay between batches, seconds', (v) => parseInt(v, 10), '1');
program.parse(process.argv);

const { batchSize, delay } = program;

if (!isFinite(batchSize) || !isFinite(delay)) {
  process.stderr.write(`⛔ Invalid program option\n`);
  program.help();
}

process.stdout.write(`Running with batch size of ${batchSize} and delay of ${delay}\n`);
process.stdout.write(`\n`);

(async () => {
  try {
    for (const table of ['posts', 'comments']) {
      process.stdout.write(`Indexing ${table}...\n`);

      let lastUID = '00000000-00000000-00000000-00000000';
      let indexed = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const { rows } = await dbAdapter.database.raw(
          `select uid, body from ${table} where uid > :lastUID order by uid limit :batchSize`,
          { lastUID, batchSize }
        );

        if (rows.length === 0) {
          break;
        }

        const sql = rows
          .map(
            (r) =>
              `update ${table} set body_tsvector = ${toTSVector(
                r.body
              )} where uid = '${r.uid}';`
          )
          .join('');

        // eslint-disable-next-line no-await-in-loop
        await dbAdapter.database.transaction(async (trx) => await trx.raw(sql.replace(/\?/g, '\\?')));

        indexed += rows.length;
        lastUID = rows[rows.length - 1].uid;

        process.stdout.write(`\tindexed ${indexed} ${table}\n`);

        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 1000 * delay));
      }

      process.stdout.write(
        `All ${table} indexed, starting VACUUM ANALYZE...\n`
      );
      // eslint-disable-next-line no-await-in-loop
      await dbAdapter.database.raw(`vacuum analyze ${table}`);
      process.stdout.write(`Done with ${table}.\n`);
    }

    process.exit(0);
  } catch (e) {
    process.stderr.write(`⛔ ERROR: ${e.message}\n`);
    process.exit(1);
  }
})();
