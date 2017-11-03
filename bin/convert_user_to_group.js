#!node_modules/.bin/babel-node
import bluebird from 'bluebird';
import commandLineArgs from 'command-line-args';

global.Promise = bluebird;
global.Promise.onPossiblyUnhandledRejection((e) => { throw e; });

import { postgres, dbAdapter } from '../app/models';

async function main() {
  const optionDefinitions = [
    { name: 'user', alias: 'u', type: String },
    { name: 'admin', alias: 'a', type: String }
  ];

  const options = commandLineArgs(optionDefinitions);

  if (!('user' in options && 'admin' in options)) {
    process.stdout.write(`Usage: convert_user_to_group -user <user> -admin <group_admin>`);
    return;
  }

  const { user, admin } = options;

  process.stdout.write(`Converting user @${user} to a group with admin @${admin}...\n`);

  // Get user uid
  const user_record = await postgres('users').first().where('username', user).where('type', 'user').returning('uid');

  if (!user_record) {
    process.stdout.write(`Unable to get uid for user: @${user}\n`);
    return;
  }

  const user_uid = user_record.uid;

  // Get admin uid
  const admin_record = await postgres('users').first().where('username', admin).returning('uid');

  if (!admin_record) {
    process.stdout.write(`Unable to get uid for user: @${user}\n`);
    return;
  }

  const admin_uid = admin_record.uid;

  // Change type to group
  await postgres('users').where('uid', user_uid).update({ type: 'group' });
  await dbAdapter.cacheFlushUser(user_uid);

  // Subscribe the new admin to the group
  const group = await dbAdapter.getGroupById(user_uid);
  await group.subscribeOwner(admin_uid);
  await group.addAdministrator(admin_uid);

  process.stdout.write(`There is now a group @${user} with admin @${admin}.\n`);
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
