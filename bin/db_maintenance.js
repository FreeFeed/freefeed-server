#!node_modules/.bin/babel-node
import bluebird from 'bluebird';

global.Promise = bluebird;
global.Promise.onPossiblyUnhandledRejection((e) => { throw e; });

import { postgres } from '../app/models'

async function purge_local_bumps() {
  // Delete local bumps older than 1 month
  process.stdout.write(`Purging local_bumps table...\n`);
  await postgres.raw(`delete from local_bumps where created_at < (current_date - interval '1 month')`);
}

async function main() {
  process.stdout.write(`Running db maintenance...\n`);
  await purge_local_bumps();
}

main()
  .then(() => {
    process.stdout.write(`Finished\n`);
    process.exit(0);
  })
  .catch((e) => {
    process.stderr.write(e.message);
    process.exit(1);
  });
