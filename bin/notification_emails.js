#!/usr/bin/env babel-node
import bluebird from 'bluebird';
import _ from 'lodash';
import { dbAdapter } from '../app/models';
import { sendEmails } from '../app/support/NotificationsDigest';

global.Promise = bluebird;
global.Promise.onPossiblyUnhandledRejection((e) => { throw e; });

async function main(){
  await sendEmails();
}

main().then(()=> {
  console.log("Finished");
  process.exit(0);
});
