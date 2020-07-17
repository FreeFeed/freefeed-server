import { program } from 'commander';

import { dbAdapter } from '../app/models';
import { GONE_NAMES, GONE_COOLDOWN, GONE_SUSPENDED, GONE_DELETION } from '../app/models/user';


(async () => {
  try {
    program
      .command('show <username>')
      .description('Show the account status')
      .action(loadAccount);
    program
      .command('rename <username> <new-username>')
      .description('Change the account username')
      .action(renameAccount);
    program
      .command('suspend <username>')
      .description('Suspend the active account for an indefinite period')
      .action(setGoneStatus(GONE_SUSPENDED));
    program
      .command('delete <username>')
      .option('-n, --now', 'Skip the cooldown period and start deletion as soon as possible', false)
      .description('Suspend the active account for a cooldown period and then delete')
      .action(setGoneStatus(GONE_COOLDOWN));
    program
      .command('resume <username>')
      .option('-f, --force', 'Resume even from the permanently deleted status', false)
      .description('Resume the inactive account')
      .action(setGoneStatus(null));
    await program.parseAsync(process.argv);

    process.exit(0);
  } catch (e) {
    process.stderr.write(`⛔ ERROR: ${e.message}\n`);
    process.exit(1);
  }
})();

async function renameAccount(username, newUsername) {
  newUsername = newUsername.toLowerCase();
  const account = await loadAccount(username);

  if (newUsername === account.username) {
    throw new Error(`New username is the same as the existing one`);
  }

  {
    const currentUsername = account.username;
    account.username = newUsername;

    if (!account.isValidUsername()) {
      throw new Error(`Username '${newUsername}' is not valid\n`);
    }

    account.username = currentUsername;
  }

  process.stdout.write(`Changing username: ${account.username} → ${newUsername}\n`);
  await account.updateUsername(newUsername);
  process.stdout.write(`Done!\n\n`);
}

function setGoneStatus(newStatus) {
  return async function (username, cmd) {
    const account = await loadAccount(username);

    if (!account.isUser()) {
      throw new Error(`This operation is only applicable to users`);
    }

    if (newStatus === GONE_COOLDOWN && cmd.now) {
      newStatus = GONE_DELETION;
    }

    if (newStatus === account.goneStatus) {
      throw new Error(`Account already in ${goneStatusName(account.goneStatus)} state`);
    }

    if (newStatus === null) {
      if (!account.isResumable && !cmd.force) {
        throw new Error(`The account in ${goneStatusName(account.goneStatus)} status cannot be resumed`);
      }
    } else if (newStatus === GONE_SUSPENDED) {
      if (!account.isActive) {
        throw new Error(`Inactive account cannot be suspended`);
      }
    } else if (newStatus === GONE_COOLDOWN) {
      if (!account.isActive) {
        throw new Error(`Inactive account cannot be deleted`);
      }
    } else if (newStatus === GONE_DELETION) {
      if (!account.isResumable) {
        throw new Error(`This account is already deleted`);
      }
    }

    process.stdout.write(`Changing user's gone status: ${goneStatusName(account.goneStatus)} → ${goneStatusName(newStatus)}\n`);
    await account.setGoneStatus(newStatus);
    process.stdout.write(`Done!\n\n`);
  }
}

async function loadAccount(username) {
  const account = await dbAdapter.getFeedOwnerByUsername(username);

  if (!account) {
    throw new Error(`The @${username} account is not found`);
  }

  if (account.username !== username) {
    process.stdout.write(`⚠ WARNING: '${username}' is the old username of @${account.username}. Continue? (y/n)\n`);
    const input = await keypress();

    if (input.toLowerCase() !== 'y') {
      process.stdout.write(`Exiting.\n`);
      process.exit(0);
    }
  }

  // Print the current status
  process.stdout.write(`Account: ${account.username}\n`);
  process.stdout.write(`Type:    ${account.type}\n`);
  process.stdout.write(`Status:  ${goneStatusName(account.goneStatus)}${account.goneAt ? ` since ${account.goneAt.toISOString()}` : ''}\n`);
  const pastUsernames = await account.getPastUsernames();

  if (pastUsernames.length > 0) {
    process.stdout.write(`Previous usernames:\n`);

    for (const p of pastUsernames) {
      process.stdout.write(`\t${p.username} (up to ${p.validTill.toISOString()})\n`);
    }
  }

  process.stdout.write(`\n`);

  return account;
}

function keypress() {
  process.stdin.setRawMode(true);
  return new Promise((resolve) => process.stdin.once('data', (data) => {
    process.stdin.setRawMode(false);
    resolve(data.toString());
  }));
}

function goneStatusName(status) {
  return (status === null && 'ACTIVE')
    || GONE_NAMES[status]
    || 'UNKNOWN';
}
