import { randomBytes } from 'node:crypto';

import { currentConfig } from '../app-async-context';

export async function createShortId(
  initialLength: number,
  tryInsert: (shortId: string) => Promise<boolean>,
) {
  for (let length = initialLength; length <= currentConfig().shortLinks.maxLength; length++) {
    // eslint-disable-next-line no-await-in-loop
    const shortId = await createShortIdForLength(tryInsert, length);

    if (shortId) {
      return shortId;
    }
  }

  throw new Error('Failed to create a short ID within the allowed length range.');
}

async function createShortIdForLength(
  tryInsert: (shortId: string) => Promise<boolean>,
  length: number,
) {
  for (let i = 0; i < currentConfig().shortLinks.maxAttempts; i++) {
    const shortId = getDecentRandomString(length);

    // eslint-disable-next-line no-await-in-loop
    if (await tryInsert(shortId)) {
      return shortId;
    }
  }

  return null;
}

function getDecentRandomString(length: number) {
  for (;;) {
    const shortId = getRandomString(length);

    if (isStringDecent(shortId)) {
      return shortId;
    }
  }
}

function isStringDecent(str: string) {
  return !currentConfig().shortLinks.stopWords.some((word) => str.includes(word));
}

function getRandomString(length: number) {
  return randomBytes(Math.ceil(length / 2)) // divide by 2 since bytes are twice longer than hex
    .toString('hex')
    .slice(0, length); // slice to cut an extra char when the length is odd
}
