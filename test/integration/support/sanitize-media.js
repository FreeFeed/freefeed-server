/* eslint-env node, mocha */
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { exiftool } from 'exiftool-vendored';
import expect from 'unexpected';
import { v4 as uuidV4 } from 'uuid';

import { sanitizeMediaMetadata } from '../../../app/support/sanitize-media';

const photoWithGPSPath = join(__dirname, '../../fixtures/photo-with-gps.jpg');
const photoWithoutGPSPath = join(__dirname, '../../fixtures/photo-without-gps.jpg');
const brokenFilePath = join(__dirname, '../../fixtures/broken-meta.jpg');
const textFilePath = join(__dirname, '../../fixtures/text-file.txt');

const gpsTags = ['GPSLatitude', 'GPSLongitude', 'GPSPosition', 'GPSLatitudeRef', 'GPSLongitudeRef'];

describe('sanitizeMediaMetadata', () => {
  it(
    `should not touch file without sensitive data`,
    withTempFile(photoWithoutGPSPath, async (filePath) => {
      const oldHash = await fileHash(filePath);
      const ok = await sanitizeMediaMetadata(filePath);
      const newHash = await fileHash(filePath);
      expect(ok, 'to be false');
      expect(oldHash, 'to be', newHash);
    }),
  );

  it(
    `should not touch text file`,
    withTempFile(textFilePath, async (filePath) => {
      const oldHash = await fileHash(filePath);
      const ok = await sanitizeMediaMetadata(filePath);
      const newHash = await fileHash(filePath);
      expect(ok, 'to be false');
      expect(oldHash, 'to be', newHash);
    }),
  );

  it(
    `should sanitize file with sensitive data`,
    withTempFile(photoWithGPSPath, async (filePath) => {
      const oldHash = await fileHash(filePath);
      const oldTags = await exiftool.read(filePath);
      expect(oldTags, 'to have keys', gpsTags);

      const ok = await sanitizeMediaMetadata(filePath);
      const newHash = await fileHash(filePath);
      const newTags = await exiftool.read(filePath);
      expect(ok, 'to be true');
      expect(oldHash, 'not to be', newHash);
      expect(newTags, 'to not have keys', gpsTags);
    }),
  );

  it(
    `should throw error on broken file`,
    withTempFile(brokenFilePath, async (filePath) => {
      await expect(sanitizeMediaMetadata(filePath), 'to be rejected');
    }),
  );
});

function withTempFile(srcFile, callback) {
  return async () => {
    const tmpFile = join(tmpdir(), `${uuidV4()}.tmp`);
    await fs.copyFile(srcFile, tmpFile);

    try {
      await callback(tmpFile);
    } finally {
      await fs.unlink(tmpFile);
    }
  };
}

async function fileHash(fileName) {
  const data = await fs.readFile(fileName);
  return createHash('sha256').update(data).digest('hex');
}
