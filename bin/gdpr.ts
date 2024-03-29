/* eslint-disable no-await-in-loop */
import childProcess from 'child_process';
import { promises as fs, exists as _exists } from 'fs';
import path from 'path';
import util from 'util';
import url from 'url';

import chunk from 'lodash/chunk';

import { DataProvider } from '../app/export/gdpr';
import { dbAdapter } from '../app/models';

const exec = util.promisify(childProcess.exec);
const exists = util.promisify(_exists);

class SimpleError extends Error {}

async function main(username: string) {
  if (typeof username === 'undefined') {
    throw new SimpleError(`Usage: babel-node ${path.basename(process.argv[1])} username`);
  }

  process.stdout.write(`Checking user '${username}'\n`);
  const user = await dbAdapter.getUserByUsername(username);

  if (!user) {
    process.stderr.write(`Can't find user named "${username}"`);
    return;
  }

  process.stdout.write(`Fetching data:\n`);
  const provider = new DataProvider(dbAdapter);
  const result = await provider.userTimelineAsQuads(user.id);
  process.stdout.write(`DONE\n`);

  process.stdout.write(`Writing data to file…\n`);
  const dirname = `${process.cwd()}/export-${username}`;

  if (!(await exists(dirname))) {
    await fs.mkdir(dirname);
  }

  const filename = `${dirname}/${username}.nt`;
  await fs.writeFile(filename, result.ntriples);
  result.ntriples = null; // clearing memory
  process.stdout.write(`-> ${filename}\n`);

  const turtlePath = `${dirname}/${username}.turtle`;
  process.stdout.write(`-> generating ${turtlePath}… `);
  exec(
    `sort < "${filename}" | rapper -i ntriples -o turtle -f 'xmlns:schema="http://schema.org/"' - 'http://freefeed.net/' > "${turtlePath}"`,
  );
  process.stdout.write(`DONE\n`);

  // attachments
  const attachmentsDir = `${process.cwd()}/export-${username}/attachments`;

  if (!(await exists(attachmentsDir))) {
    await fs.mkdir(attachmentsDir);
  }

  process.stdout.write(`Downloading attachments:\n`);
  const urlChunks = chunk(result.downloadUrls, 8);

  for (const urls of urlChunks) {
    const promises = urls.map(async (downloadUrl) => {
      const _url = new url.URL(downloadUrl);
      const filePath = `${attachmentsDir}/${path.basename(_url.pathname)}`;

      if (await exists(filePath)) {
        return;
      }

      const downloadResult = await fetch(downloadUrl);
      const buffer = await downloadResult.arrayBuffer();
      await fs.writeFile(filePath, new Uint8Array(buffer));
      process.stdout.write(`-> ${filePath}\n`);
    });

    await Promise.all(promises);
  }

  process.stdout.write(`DONE\n`);
}

main(process.argv[2])
  .then(() => {
    process.stdout.write(`Finished\n`);
    process.exit(0);
  })
  .catch((e) => {
    process.stderr.write(`${e.message}\n`);

    if (e.constructor !== SimpleError) {
      process.stderr.write(e.stack);
    }

    process.exit(1);
  });
