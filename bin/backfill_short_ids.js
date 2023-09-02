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
    // 1. Posts

    process.stdout.write(`Processing posts...\n`);
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

    // 2. Comments

    process.stdout.write(`Processing comments...\n`);
    lastUID = ZERO_UID;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const rows = await dbAdapter.database.getAll(
        `SELECT uid as comment_id, post_id
        FROM comments 
        WHERE short_id IS NULL AND uid > :lastUID
        ORDER BY uid
        LIMIT :batchSize`,
        { lastUID, batchSize },
      );

      if (rows.length === 0) {
        break;
      }

      for (const { comment_id, post_id } of rows) {
        const short_id = await dbAdapter.generateCommentShortId(dbAdapter.database, post_id);
        await dbAdapter.database('comments').where('uid', comment_id).update({ short_id });
        lastUID = comment_id;
      }

      const percent = (parseInt(lastUID.slice(0, 2), 16) * 100) >> 8;
      process.stdout.write(`\tprocessed ${percent}% of total\n`);

      await delay(1000 * delaySec);
    }

    process.stdout.write(`All comments were processed.\n`);

    process.stdout.write(`Done.\n`);
    process.exit(0);
  } catch (e) {
    process.stderr.write(`⛔ ERROR: ${e.message}\n`);
    process.exit(1);
  }
})();
