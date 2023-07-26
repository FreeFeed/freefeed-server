/* eslint-disable no-await-in-loop */

import { program } from 'commander';

import { dbAdapter } from '../app/models';
import { delay } from '../app/support/timers';

// Backfill short IDs for preexisting posts
// Usage: yarn babel bin/backfill_short_ids.js --help

const ZERO_UID = '00000000-00000000-00000000-00000000';

program
  .option('--batch-size <batch size>', 'batch size', (v) => parseInt(v, 10), 1000)
  .option('--delay <delay>', 'delay between batches, seconds', (v) => parseInt(v, 10), 1);
program.parse(process.argv);

const [batchSize, delaySec] = [
  program.getOptionValue('batchSize'),
  program.getOptionValue('delay'),
];

if (!isFinite(batchSize) || !isFinite(delaySec)) {
  process.stderr.write(`⛔ Invalid program option\n`);
  program.help();
}

process.stdout.write(`Running with batch size of ${batchSize} and delay of ${delaySec}\n`);
process.stdout.write(`\n`);

(async () => {
  try {
    let lastUID = ZERO_UID;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const longIds = await dbAdapter.database.getCol(
        `SELECT uid 
        FROM posts AS p 
        LEFT JOIN post_short_ids AS s ON p.uid = s.long_id
        WHERE s.long_id IS NULL AND p.uid > :lastUID
        ORDER BY uid
        LIMIT :batchSize`,
        { lastUID, batchSize },
      );

      if (longIds.length === 0) {
        break;
      }

      for (const longId of longIds) {
        await dbAdapter.createPostShortId(dbAdapter.database, longId);
        lastUID = longId;
      }

      const percent = (parseInt(lastUID.slice(0, 2), 16) * 100) >> 8;
      process.stdout.write(`\tprocessed ${percent}% of total\n`);

      await delay(1000 * delaySec);
    }

    process.stdout.write(`All posts were processed.\n`);
    process.stdout.write(`Done.\n`);

    process.exit(0);
  } catch (e) {
    process.stderr.write(`⛔ ERROR: ${e.message}\n`);
    process.exit(1);
  }
})();
