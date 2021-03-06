import { promises as fs, createWriteStream } from 'fs';
import crypto from 'crypto';
import path from 'path';
import { URL } from 'url';

import meter from 'stream-meter';
import { wait as waitStream, pipeline } from 'promise-streams';
import fetch from 'node-fetch';
import mediaType from 'media-type';
import { parse as bytesParse } from 'bytes';
import config from 'config';

const fileSizeLimit = bytesParse(config.attachments.fileSizeLimit);

export async function downloadURL(url: string) {
  const parsedURL = new URL(url);

  if (parsedURL.protocol !== 'http:' && parsedURL.protocol !== 'https:') {
    throw new Error('Unsupported URL protocol');
  }

  const parsedPath = path.parse(parsedURL.pathname);
  const originalFileName = parsedPath.base !== '' ? decodeURIComponent(parsedPath.base) : 'file';

  const bytes = crypto.randomBytes(4).readUInt32LE(0);
  const filePath = `/tmp/pepyatka${bytes}tmp${parsedPath.ext}`;

  const response = await fetch(parsedURL.href);

  if (response.status !== 200) {
    throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
  }

  const mType = mediaType.fromString(response.headers.get('content-type') || '');

  // if (mType.type !== 'image') {
  //   throw new Error(`Unsupported content type: '${mType.asString() || '-'}'`);
  // }

  if (response.headers.has('content-length')) {
    const contentLength = parseInt(response.headers.get('content-length')!);

    if (!isNaN(contentLength) && contentLength > fileSizeLimit) {
      throw new Error(`File is too large (${contentLength} bytes, max. ${fileSizeLimit})`);
    }
  }

  try {
    const stream = createWriteStream(filePath, { flags: 'w' });
    const fileWasWritten = waitStream(stream);
    await pipeline(response.body, meter(fileSizeLimit), stream);
    await fileWasWritten; // waiting for the file to be written and closed

    const stats = await fs.stat(filePath);

    return {
      name: originalFileName,
      size: stats.size,
      type: mType.asString() || 'application/octet-stream',
      path: filePath,
      unlink() {
        return fs.unlink(this.path);
      },
    };
  } catch (e) {
    await fs.unlink(filePath);
    throw e;
  }
}
