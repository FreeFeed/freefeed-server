/* eslint-env node, mocha */
/* global $pg_database */
import { join } from 'path';
import { readFile } from 'fs/promises';
import { createHash } from 'crypto';

import { exiftool } from 'exiftool-vendored';
import expect from 'unexpected';

import { User } from '../../../app/models';
import cleanDB from '../../dbCleaner';

import { createAttachment } from './attachment-helpers';

const photoWithGPSPath = join(__dirname, '../../fixtures/photo-with-gps.jpg');
const photoWithoutGPSPath = join(__dirname, '../../fixtures/photo-without-gps.jpg');

const gpsTags = ['GPSLatitude', 'GPSLongitude', 'GPSPosition', 'GPSLatitudeRef', 'GPSLongitudeRef'];

describe('Sanitize media metadata', () => {
  before(() => cleanDB($pg_database));

  let luna;
  before(async () => {
    luna = new User({ username: 'luna', password: 'pw' });
    await luna.create();
  });

  it('should sanitize attachment metadata', async () => {
    const oldTags = await exiftool.read(photoWithGPSPath);
    expect(oldTags, 'to have keys', gpsTags);

    const att = await createAttachment(luna.id, {
      name: `photo.jpg`,
      type: 'image/jpeg',
      content: await readFile(photoWithGPSPath),
    });

    const newTags = await exiftool.read(att.getPath());
    expect(newTags, 'to not have keys', gpsTags);
  });

  it('should not alter file without sensitive metadata', async () => {
    const content = await readFile(photoWithoutGPSPath);
    const oldHash = fileHash(content);

    const att = await createAttachment(luna.id, {
      name: `photo.jpg`,
      type: 'image/jpeg',
      content,
    });

    const newContent = await readFile(att.getPath());
    const newHash = fileHash(newContent);
    expect(newHash, 'to equal', oldHash);
  });

  describe(`Luna doesn't want to sanitize her files`, () => {
    before(() => luna.update({ preferences: { sanitizeMediaMetadata: false } }));
    after(() => luna.update({ preferences: { sanitizeMediaMetadata: true } }));

    it('should not alter file with sensitive metadata', async () => {
      const content = await readFile(photoWithGPSPath);
      const oldHash = fileHash(content);

      const att = await createAttachment(luna.id, {
        name: `photo.jpg`,
        type: 'image/jpeg',
        content,
      });

      const newContent = await readFile(att.getPath());
      const newHash = fileHash(newContent);
      expect(newHash, 'to equal', oldHash);
    });
  });
});

function fileHash(content) {
  return createHash('sha256').update(content).digest('hex');
}
