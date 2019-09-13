#!/usr/bin/env babel-node
import bluebird from 'bluebird';

import { sendEmails } from '../app/support/NotificationsDigest';

global.Promise = bluebird;
global.Promise.onPossiblyUnhandledRejection((e) => {
  throw e;
});

sendEmails()
  .then(() => {
    process.stdout.write('Finished\n');
    process.exit(0);
  })
  .catch((e) => {
    process.stderr.write(`Error: ${e}\n`);
    process.exit(1);
  });
