/* eslint-disable no-await-in-loop */
import { promises as fs } from 'fs';
import path from 'path';

import { program } from 'commander';

import { dbAdapter } from '../app/models';
import { delay } from '../app/support/timers';

// Add sequential numbers to comments.
// Usage: yarn babel bin/migration_comment_numbers.js --help

const ZERO_UID = '00000000-00000000-00000000-00000000';
const statusFile = path.join(__dirname, '../tmp/migration_comment_numbers.json');

program
  .option('--batch-size <batch size>', 'batch size', (v) => parseInt(v, 10), 1000)
  .option('--delay <delay>', 'delay between batches, milliseconds', (v) => parseInt(v, 10), 100)
  .option('--restart', 'start process from the beginning');
program.parse(process.argv);

const [batchSize, delayMsec, restart] = [
  program.getOptionValue('batchSize'),
  program.getOptionValue('delay'),
  program.getOptionValue('restart'),
];

if (!isFinite(batchSize) || !isFinite(delayMsec)) {
  process.stderr.write(`⛔ Invalid program option\n`);
  program.help();
}

process.stdout.write(`Running with batch size of ${batchSize} and delay of ${delayMsec} ms\n`);
process.stdout.write(`Status file: ${statusFile}\n`);
process.stdout.write(`\n`);

(async () => {
  try {
    let lastUID = ZERO_UID;

    if (!restart) {
      try {
        const statusText = await fs.readFile(statusFile, { encoding: 'utf8' });
        ({ lastUID } = JSON.parse(statusText));
      } catch (err) {
        if (err.code !== 'ENOENT') {
          throw new Error(`Cannot read status from ${statusFile}: ${err.message}`);
        }

        process.stdout.write(`Status file is not found, starting from the beginning...\n`);
      }
    }

    process.stdout.write(`Processing posts starting from ${lastUID}...\n`);
    let processed = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const start = Date.now();

      const postIds = await dbAdapter.database.getCol(
        `select uid from posts where uid > :lastUID order by uid limit :batchSize`,
        { lastUID, batchSize },
      );

      if (postIds.length === 0) {
        break;
      }

      await dbAdapter.database.transaction(async (trx) => {
        await trx.raw(
          `create temp table tmpdata (comment_id uuid, post_id uuid, number int) on commit drop`,
        );

        await trx.raw(
          `insert into tmpdata (comment_id, post_id, number)
          select
            uid,
            post_id, 
            rank() over (partition by post_id order by created_at) 
            from comments where post_id = any(:postIds)`,
          { postIds },
        );

        await trx.raw(
          `update comments set
          seq_number = t.number
          from tmpdata t where t.comment_id = uid`,
        );
      });

      lastUID = postIds[postIds.length - 1];
      processed += postIds.length;

      const percent = (parseInt(lastUID.substr(0, 2), 16) * 100) >> 8;
      const speed = Math.round((batchSize * 1000) / (Date.now() - start));

      process.stdout.write(
        `\tprocessed ${processed} posts at ${speed} post/sec (${percent}% of total)\n`,
      );

      await saveStatus(lastUID);
      await delay(delayMsec);
    }

    process.stdout.write(`All done.\n`);
    await fs.unlink(statusFile);

    process.exit(0);
  } catch (e) {
    process.stderr.write(`⛔ ERROR: ${e.message}\n`);
    process.exit(1);
  }
})();

async function saveStatus(lastUID) {
  await fs.mkdir(path.dirname(statusFile), { recursive: true });
  await fs.writeFile(statusFile, JSON.stringify({ lastUID }));
}
