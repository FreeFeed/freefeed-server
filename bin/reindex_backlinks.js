/* eslint-disable no-await-in-loop */
import { promises as fs } from 'fs';
import path from 'path';

import { program } from 'commander';

import { dbAdapter } from '../app/models';
import { extractUUIDs } from '../app/support/backlinks';

// Reindex baclinks in posts and comments.
// Usage: yarn babel bin/reindex_backlinks.js --help

const allTables = ['posts', 'comments'];
const ZERO_UID = '00000000-00000000-00000000-00000000';
const statusFile = path.join(__dirname, '../tmp/reindex_backlinks.json');

program
  .option('--batch-size <batch size>', 'batch size', (v) => parseInt(v, 10), '1000')
  .option('--delay <delay>', 'delay between batches, seconds', (v) => parseInt(v, 10), '1')
  .option('--retries <count>', 'count of retries in case of failure', (v) => parseInt(v, 10), '10')
  .option('--timeout <timeout>', 'timeout of transaction in PostgreSQL syntax', '1min')
  .option('--restart', 'start indexing from the beginning and drop the existing backlinks');
program.parse(process.argv);

const { batchSize, delay, retries, timeout } = program;

if (!isFinite(batchSize) || !isFinite(delay)) {
  process.stderr.write(`⛔ Invalid program option\n`);
  program.help();
}

process.stdout.write(`Running with batch size of ${batchSize} and delay of ${delay}\n`);
process.stdout.write(`Status file: ${statusFile}\n`);
process.stdout.write(`\n`);

(async () => {
  try {
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
    } else {
      // Drop existing backlinks
      await dbAdapter.database.raw(`truncate table backlinks`);
    }

    if (!allTables.includes(table)) {
      throw new Error(`Unknown table name '${table}'`);
    }

    while (table) {
      const isComments = table === 'comments';
      process.stdout.write(`Processing ${table} starting from ${lastUID}...\n`);
      let indexed = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        let rows;

        if (isComments) {
          ({ rows } = await dbAdapter.database.raw(
            `select uid, post_id as ref_post_id, uid as ref_comment_id, body
              from ${table} where uid > :lastUID order by uid limit :batchSize`,
            { lastUID, batchSize },
          ));
        } else {
          ({ rows } = await dbAdapter.database.raw(
            `select uid, uid as ref_post_id, null as ref_comment_id, body
              from ${table} where uid > :lastUID order by uid limit :batchSize`,
            { lastUID, batchSize },
          ));
        }

        if (rows.length === 0) {
          break;
        }

        const allUUIDs = new Set();

        for (const row of rows) {
          const uuids = extractUUIDs(row.body);

          for (const uuid of uuids) {
            allUUIDs.add(uuid);
          }

          row.uuids = uuids;
        }

        let attemptsLeft = retries;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const start = Date.now();

          try {
            await dbAdapter.database.transaction(async (trx) => {
              // Cannot use placeholder here: Postgres doesn't allow prepared statements for 'set'
              await trx.raw(`set local statement_timeout to '${timeout.replace(/'/g, `''`)}'`);

              // Only the real post UUIDs
              const realUUIDs = new Set(
                await dbAdapter.database.getCol(`select uid from posts where uid = any(:uuids)`, {
                  uuids: [...allUUIDs],
                }),
              );

              await trx.raw(
                `create temp table b_data (post_id uuid, ref_post_id uuid, ref_comment_id uuid) on commit drop`,
              );
              const toInsert = [];

              for (const row of rows) {
                const uuids = row.uuids.filter((u) => realUUIDs.has(u));

                for (const uuid of uuids) {
                  toInsert.push({
                    post_id: uuid,
                    ref_post_id: row.ref_post_id,
                    ref_comment_id: row.ref_comment_id,
                  });
                }
              }

              await trx('b_data').insert(toInsert);

              await trx.raw(
                `insert into backlinks (post_id, ref_post_id, ref_comment_id)
                select * from b_data
                on conflict do nothing`,
              );
            });

            indexed += rows.length;
            lastUID = rows[rows.length - 1].uid;

            const percent = (parseInt(lastUID.substr(0, 2), 16) * 100) >> 8;
            const speed = Math.round((batchSize * 1000) / (Date.now() - start));
            process.stdout.write(
              `\tprocessed ${indexed} ${table} at ${speed} upd/sec (${percent}% of total)\n`,
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

          await new Promise((resolve) => setTimeout(resolve, 1000 * delay));
        }
      }

      process.stdout.write(`Done with ${table}.\n`);

      table = allTables[allTables.indexOf(table) + 1];
      lastUID = ZERO_UID;
    }

    process.stdout.write(`All tables were processed.\n`);
    process.stdout.write(`Starting 'VACUUM ANALYZE backlinks'...\n`);
    await dbAdapter.database.raw(`vacuum analyze backlinks`);
    process.stdout.write(`Done.\n`);
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
