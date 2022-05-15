#!/usr/bin/env babel-node
import { sendBestOfEmails } from '../app/support/BestOfDigest';
import { registry } from '../app/models';

sendBestOfEmails(registry)
  .then(() => {
    process.stdout.write('Finished\n');
    process.exit(0);
  })
  .catch((e) => {
    process.stderr.write(`Error: ${e.message}\n`);
    process.stderr.write(`${e.stack}\n`);
    process.exit(1);
  });
