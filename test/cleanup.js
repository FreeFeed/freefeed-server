/* eslint-env node, mocha */
import { readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

import { load as configLoader } from '../config/config'


after(() => cleanDir(configLoader().attachments.storage.rootDir));

/**
 * cleanDir recursively removes all files in the given directory
 * but leaves directory structure. The empty structure is useful
 * for the single tests runs.
 *
 * @param {String} dirName
 */
function cleanDir(dirName) {
  for (const fileName of readdirSync(dirName)) {
    const path = join(dirName, fileName);
    const isDirectory = statSync(path).isDirectory();

    if (isDirectory) {
      cleanDir(path);
    } else {
      unlinkSync(path);
    }
  }
}
