import { readFileSync } from 'fs';
import { EOL } from 'os';

import config from 'config';

const domainBlockList = readBlockList(config.emailVerification.domainBlockList);

// A very simple normalization. It just removes from username part of email all
// dots and all content starting from "+" symbol.
export function normalizeEmail(address: string): string {
  const [username, hostname] = splitAddress(address.toLowerCase());

  if (!hostname) {
    // Not email address
    return username;
  }

  return `${username.replace(/\+.*/, '').replace(/\./g, '')}@${hostname}`;
}

export function isBlockedEmailDomain(address: string, blockList = domainBlockList): boolean {
  const [, hostname = ''] = splitAddress(address.toLowerCase());

  for (const block of blockList) {
    if (hostname === block || hostname.endsWith(`.${block}`)) {
      return true;
    }
  }

  return false;
}

function splitAddress(address: string): [string] | [string, string] {
  const p = address.indexOf('@');

  if (p === -1) {
    return [address];
  }

  return [address.substring(0, p), address.substring(p + 1)];
}

function readBlockList(path: string | null): string[] {
  const result: string[] = [];

  if (path === null) {
    return result;
  }

  const lines = readFileSync(path, 'utf-8').split(EOL);

  for (let line of lines) {
    line = line.trim();

    if (line === '' || line.charAt(0) === '#') {
      continue;
    }

    result.push(line);
  }

  return result;
}
