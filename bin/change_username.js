import path from 'path';

import { dbAdapter } from '../app/models';

if (process.argv.length !== 4) {
  process.stdout.write(
    `Usage: yarn run babel-node ${path.basename(
      process.argv[1],
    )} <current username> <new username>\n`,
  );
  process.exit(1);
}

let currentUsername = process.argv[2].toLowerCase();
const newUsername = process.argv[3].toLowerCase();

(async () => {
  try {
    const account = await dbAdapter.getFeedOwnerByUsername(currentUsername);

    if (!account) {
      throw new Error(`User or group '${currentUsername}' was not found\n`);
    }

    if (account.username !== currentUsername) {
      process.stdout.write(
        `⚠ WARNING: '${currentUsername}' is the old username of '${account.username}'. Continue? (y/n)\n`,
      );
      const input = await keypress();

      if (input.toLowerCase() !== 'y') {
        process.stdout.write(`Exiting.\n`);
        process.exit(0);
      }

      currentUsername = account.username;
    }

    {
      account.username = newUsername;

      if (!account.isValidUsername()) {
        throw new Error(`Username '${newUsername}' is not valid\n`);
      }

      account.username = currentUsername;
    }

    process.stdout.write(`Changing username: '${account.username}' → '${newUsername}'\n`);
    await account.updateUsername(newUsername);
    process.stdout.write(`Done!\n`);

    process.exit(0);
  } catch (e) {
    process.stderr.write(`⛔ ERROR: ${e.message}\n`);
    process.exit(1);
  }
})();

function keypress() {
  process.stdin.setRawMode(true);
  return new Promise((resolve) =>
    process.stdin.once('data', (data) => {
      process.stdin.setRawMode(false);
      resolve(data.toString());
    }),
  );
}
