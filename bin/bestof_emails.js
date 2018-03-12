#!/usr/bin/env babel-node
import bb from 'bluebird';

import { sendBestOfEmails } from '../app/support/BestOfDigest';

require('babel-runtime/core-js/promise').default = bb;
global.Promise = bb;
bb.coroutine.addYieldHandler((value) => bb.resolve(value));
bb.onPossiblyUnhandledRejection((e) => {
  process.stderr.write(`Unhandled Exception ${e}`);
});

sendBestOfEmails()
  .then(() => {
    process.stdout.write('Finished\n');
    process.exit(0);
  })
  .catch((e) => {
    process.stderr.write(`Error: ${e}\n`);
    process.exit(1);
  });
