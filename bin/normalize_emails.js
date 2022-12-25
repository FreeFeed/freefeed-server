/* eslint-disable no-await-in-loop */

import { program } from 'commander';

import { dbAdapter } from '../app/models';
import { normalizeEmail } from '../app/support/email-norm';

// Normalize all user's emails
// Usage: yarn babel bin/normalize_emails.js --help

const ZERO_UID = '00000000-00000000-00000000-00000000';

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
    let lastUID = ZERO_UID;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const rows = await dbAdapter.database.getAll(
        `select uid, email from users where 
        email is not null and uid > :lastUID
        order by uid limit :batchSize`,
        { lastUID, batchSize },
      );

      if (rows.length === 0) {
        break;
      }

      for (const { uid, email } of rows) {
        const normEmail = normalizeEmail(email);
        await dbAdapter.database.raw(`update users set email_norm = :normEmail where uid = :uid`, {
          normEmail,
          uid,
        });

        lastUID = uid;
      }

      const percent = (parseInt(lastUID.substr(0, 2), 16) * 100) >> 8;
      process.stdout.write(`\tprocessed ${percent}% of total\n`);

      await delay(1000 * delay);
    }

    process.stdout.write(`All users were processed.\n`);
    process.stdout.write(`Done.\n`);

    process.exit(0);
  } catch (e) {
    process.stderr.write(`⛔ ERROR: ${e.message}\n`);
    process.exit(1);
  }
})();
