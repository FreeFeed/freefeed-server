#!/usr/bin/env babel-node
import fs from 'fs';
import bluebird from 'bluebird';

global.Promise = bluebird;
global.Promise.onPossiblyUnhandledRejection((e) => { throw e; });

Promise.promisifyAll(fs);

import { postgres, dbAdapter } from '../app/models'

async function main() {
  process.stdout.write(`Started\n`);

  const dataFilePath = process.argv[2];
  if (!dataFilePath) {
    return;
  }

  const file = await fs.readFileAsync(dataFilePath, 'utf8');
  const clikesData = JSON.parse(file);
  const clikesCount = clikesData.length;

  for (const i in clikesData) {
    const clike = clikesData[i];
    process.stdout.write(`Processing clikes: ${parseInt(i) + 1} of ${clikesCount}\r`);
    const [commentId, userId] = await dbAdapter._getCommentAndUserIntId(clike.comment_id, clike.user_id);

    const payload = {
      comment_id: commentId,
      user_id:    userId,
      created_at: clike.date
    };

    await postgres('comment_likes').insert(payload);
  }
  process.stdout.write(`\n`);
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
