#!/usr/bin/env babel-node
import { sendEmails } from '../app/support/NotificationsDigest';
import { registry } from '../app/models';

sendEmails(registry.dbAdapter)
  .then(() => {
    process.stdout.write('Finished\n');
    process.exit(0);
  })
  .catch((e) => {
    process.stderr.write(`Error: ${e}\n`);
    process.exit(1);
  });
