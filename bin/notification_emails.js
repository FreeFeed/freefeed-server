#!/usr/bin/env babel-node
import { sendEmails } from '../app/support/NotificationsDigest';


sendEmails()
  .then(() => {
    process.stdout.write('Finished\n');
    process.exit(0);
  })
  .catch((e) => {
    process.stderr.write(`Error: ${e}\n`);
    process.exit(1);
  });
