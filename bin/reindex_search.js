/* eslint-disable no-await-in-loop */
import { promises as fs } from 'fs';
import path from 'path';

import { program } from 'commander';

import { configure as configurePostgres } from '../app/setup/postgres';
import { dbAdapter } from '../app/models';
import { toTSVector } from '../app/support/search/to-tsvector';

// Reindex search columns in 'posts' and 'comments' tables.
// Usage: yarn babel-node bin/reindex_search.js --help

const allTables = ['posts', 'comments'];
const ZERO_UID = '00000000-00000000-00000000-00000000';
const statusFile =  path.join(__dirname, '../tmp/reindex_search.json');

program
  .option('--batch-size <batch size>', 'batch size', (v) => parseInt(v, 10), '1000')
  .option('--delay <delay>', 'delay between batches, seconds', (v) => parseInt(v, 10), '1')
  .option('--restart', 'start indexing from the beginning');
program.parse(process.argv);

const { batchSize, delay } = program;

if (!isFinite(batchSize) || !isFinite(delay)) {
  process.stderr.write(`⛔ Invalid program option\n`);
  program.help();
}

process.stdout.write(`Running with batch size of ${batchSize} and delay of ${delay}\n`);
process.stdout.write(`Status file: ${statusFile}\n`);
process.stdout.write(`\n`);

(async () => {
  try {
    await configurePostgres();

    let lastUID = ZERO_UID;
    let [table] = allTables;

    if (!program.restart) {
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

        await dbAdapter.database.transaction(async (trx) => await trx.raw(sql.replace(/\?/g, '\\?')));

        indexed += rows.length;
        lastUID = rows[rows.length - 1].uid;


        const percent = parseInt(lastUID.substr(0, 2), 16) * 100 >> 8;
        process.stdout.write(`\tindexed ${indexed} ${table} (${percent}% of total)\n`);

        await Promise.all([
          saveStatus(lastUID, table),
          new Promise((resolve) => setTimeout(resolve, 1000 * delay)),
        ]);
      }

      process.stdout.write(
        `All ${table} indexed, starting VACUUM ANALYZE...\n`
      );
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
