import { randomBytes } from 'crypto';

import { Nullable } from './types';

// A random codes made of Douglas Crockford's Base32 alphabet
// (https://www.crockford.com/base32.html). This alphabet is case insensitive
// and and quite resistant to typos.

const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function createBase32Code(length: number): string {
  const bytes = randomBytes(length);
  return [...bytes].map((b) => alphabet.charAt(b & 0x1f)).join('');
}

export function normalizeBase32Code(input: string, expectedLength: number = 0): Nullable<string> {
  const code = input
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/U/g, 'V')
    .replace(new RegExp(`[^${alphabet}]`, 'g'), '');
  return expectedLength && code.length !== expectedLength ? null : code;
}
