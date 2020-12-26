/* eslint-env node, mocha */
/* global $pg_database */
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';

import expect from 'unexpected';

import cleanDB from '../../dbCleaner';
import { Attachment, User } from '../../../app/models';


describe('Attachment2', () => {
  before(() => cleanDB($pg_database));
  let luna;
  before(async () => {
    luna = new User({ username: 'luna', password: 'pw' });
    await luna.create();
  });

  it(`should create JPEG attachment`, async () => {
    const file = await uploadFile(
      'test-image-exif-rotated.900x300.jpg',
      'image/jpeg'
    );
    const att = new Attachment({ file, userId: luna.id });
    await att.create();
    expect(att, 'to satisfy', {
      mediaType:     'image',
      mimeType:      'image/jpeg',
      fileExtension: 'jpg',
    });
    await att.deleteFiles();
  });

  it(`should not create HTML attachment`, async () => {
    const file = await uploadFile('lol.html', 'text/html');
    const att = new Attachment({ file, userId: luna.id });
    await expect(att.create(), 'to be rejected with', 'Unsupported MIME type: text/html');
    await fs.unlink(file.path);
  });

  it(`should create WebP attachment`, async () => {
    const file = await uploadFile(
      'test-image.900x300.webp',
      'image/webp'
    );
    const att = new Attachment({ file, userId: luna.id });
    await att.create();
    expect(att, 'to satisfy', {
      mediaType:     'image',
      mimeType:      'image/webp',
      fileExtension: 'webp',
    });
    await att.deleteFiles();
  });
});

const fixturesDir = path.resolve(__dirname, '../../fixtures');
const tmpDir = os.tmpdir();

async function uploadFile(fileName, mimeType) {
  const uplPath = path.join(tmpDir, fileName);
  // Upload file
  await fs.copyFile(path.join(fixturesDir, fileName), uplPath);
  const st = await fs.stat(uplPath);
  return {
    path: uplPath,
    name: fileName,
    size: st.size,
    type: mimeType,
  };
}
