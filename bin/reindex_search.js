/* eslint-disable no-await-in-loop */
import { promises as fs } from 'fs';
import path from 'path';

import { program } from 'commander';

import { setSearchConfig } from '../app/setup/postgres';
import { dbAdapter } from '../app/models';
import { toTSVector } from '../app/support/search/to-tsvector';
import { delay } from '../app/support/timers';

// Reindex search columns in 'posts' and 'comments' tables.
// Usage: yarn babel bin/reindex_search.js --help

const allTables = ['posts', 'comments'];
const ZERO_UID = '00000000-00000000-00000000-00000000';
const statusFile = path.join(__dirname, '../tmp/reindex_search.json');

program
  .option('--batch-size <batch size>', 'batch size', (v) => parseInt(v, 10), 1000)
  .option('--delay <delay>', 'delay between batches, seconds', (v) => parseInt(v, 10), 1)
  .option('--retries <count>', 'count of retries in case of failure', (v) => parseInt(v, 10), 10)
  .option('--timeout <timeout>', 'timeout of transaction in PostgreSQL syntax', '1min')
  .option('--restart', 'start indexing from the beginning');
program.parse(process.argv);

const [batchSize, delaySec, retries, timeout, restart] = [
  program.getOptionValue('batchSize'),
  program.getOptionValue('delay'),
  program.getOptionValue('retries'),
  program.getOptionValue('timeout'),
  program.getOptionValue('restart'),
];

if (!isFinite(batchSize) || !isFinite(delaySec)) {
  process.stderr.write(`⛔ Invalid program option\n`);
  program.help();
}

process.stdout.write(`Running with batch size of ${batchSize} and delay of ${delaySec}\n`);
process.stdout.write(`Status file: ${statusFile}\n`);
process.stdout.write(`\n`);

(async () => {
  try {
    await setSearchConfig();

    let lastUID = ZERO_UID;
    let [table] = allTables;

    if (!restart) {
      try {
        const statusText = await fs.readFile(statusFile, { encoding: 'utf8' });
        ({ lastUID, table } = JSON.parse(statusText));
      } catch (err) {
        if (err.code !== 'ENOENT') {
          throw new Error(`Cannot read status from ${statusFile}: ${err.message}`);
        }

        process.stdout.write(`Status file is not found, starting from the beginning...\n`);
      }
    }

    if (!allTables.includes(table)) {
      throw new Error(`Unknown table name '${table}'`);
    }

    while (table) {
      process.stdout.write(`Indexing ${table} starting from ${lastUID}...\n`);
      let indexed = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { rows } = await dbAdapter.database.raw(
          `select uid, body from ${table} where uid > :lastUID order by uid limit :batchSize`,
          { lastUID, batchSize },
        );

        if (rows.length === 0) {
          break;
        }

        let attemptsLeft = retries;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const start = Date.now();

          try {
            await dbAdapter.database.transaction(async (trx) => {
              // Cannot use placeholder here: Postgres doesn't allow prepared statements for 'set'
              await trx.raw(`set local statement_timeout to '${timeout.replace(/'/g, `''`)}'`);
              await trx.raw(`create temp table ftsdata (uid uuid, vector tsvector) on commit drop`);
              await trx('ftsdata').insert(
                rows.map((r) => ({
                  uid: r.uid,
                  vector: trx.raw(toTSVector(r.body).replace(/\?/g, '\\?')),
                })),
              );
              await trx.raw(
                `update ${table} set body_tsvector = vector from ftsdata where ${table}.uid = ftsdata.uid`,
              );
            });

            indexed += rows.length;
            lastUID = rows[rows.length - 1].uid;

            const percent = (parseInt(lastUID.substr(0, 2), 16) * 100) >> 8;
            const speed = Math.round((batchSize * 1000) / (Date.now() - start));
            process.stdout.write(
              `\tindexed ${indexed} ${table} at ${speed} upd/sec (${percent}% of total)\n`,
            );

            await saveStatus(lastUID, table);

            break;
          } catch (e) {
            if (e.code === '57014' /* query_canceled */ && attemptsLeft > 0) {
              process.stdout.write(`\tquery canceled at ${Date.now() - start} ms, retrying...\n`);
              attemptsLeft--;
            } else {
              throw e;
            }
          }

          await delay(1000 * delaySec);
        }
      }

      process.stdout.write(`All ${table} indexed, starting VACUUM ANALYZE...\n`);
      await dbAdapter.database.raw(`vacuum analyze ${table}`);
      process.stdout.write(`Done with ${table}.\n`);

      table = allTables[allTables.indexOf(table) + 1];
      lastUID = ZERO_UID;
    }

    process.stdout.write(`All tables were indexed.\n`);
    await fs.unlink(statusFile);

    process.exit(0);
  } catch (e) {
    process.stderr.write(`⛔ ERROR: ${e.message}\n`);
    process.exit(1);
  }
})();

async function saveStatus(lastUID, table) {
  await fs.mkdir(path.dirname(statusFile), { recursive: true });
  await fs.writeFile(statusFile, JSON.stringify({ lastUID, table }));
}
