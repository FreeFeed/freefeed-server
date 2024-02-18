import { xor } from 'lodash';
import { LINK } from 'social-text-tokenizer';
import { linkHref } from 'social-text-tokenizer/prettifiers';

import { List } from './open-lists';
import { UUID } from './types';
import { SHORT_LINK, tokenize } from './tokenize-text';

export function getUpdatedUUIDs(text1: string, text2: string = '') {
  if (text1 === text2) {
    return [];
  }

  return xor(extractUUIDs(text1), extractUUIDs(text2));
}

export function getUpdatedShortIds(text1: string, text2: string = '') {
  if (text1 === text2) {
    return [];
  }

  return xor(extractShortIds(text1), extractShortIds(text2));
}

const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
export function extractUUIDs(text: string | null): UUID[] {
  return text ? [...text.matchAll(uuidRe)].map((m) => m[0]).filter(onlyUnique) : [];
}

const shortLinkStr = `/[A-Za-z0-9-]{3,35}/([0-9a-f]{6,10})`;
const shortLinkReStart = new RegExp(`^${shortLinkStr}`, 'i');
const shortLinkReExact = new RegExp(`^${shortLinkStr}$`, 'i');

const hashedShortLinkStr = `/[A-Za-z0-9-]{3,35}/([0-9a-f]{6,10}#[0-9a-f]{4,6})`;
const hashedShortLinkReExact = new RegExp(`^${hashedShortLinkStr}$`, 'i');

export function extractShortIds(text: string | null): string[] {
  if (!text) {
    return [];
  }

  return tokenize(text)
    .map((token) => {
      if (token.type === SHORT_LINK) {
        const m = token.text.match(shortLinkReStart);
        return m?.[1];
      } else if (token.type === LINK) {
        const href = linkHref(token.text);

        try {
          const url = new URL(href);
          return url.pathname.match(shortLinkReExact)?.[1];
        } catch {
          return undefined;
        }
      }

      return undefined;
    })
    .filter(Boolean)
    .filter(onlyUnique) as string[];
}

export function extractHashedShortIds(text: string | null): string[] {
  if (!text) {
    return [];
  }

  return tokenize(text)
    .map((token) => {
      if (token.type === SHORT_LINK) {
        return token.text.match(hashedShortLinkReExact)?.[1];
      } else if (token.type === LINK) {
        const href = linkHref(token.text);

        try {
          const url = new URL(href);
          return (url.pathname + url.search + url.hash).match(hashedShortLinkReExact)?.[1];
        } catch {
          return undefined;
        }
      }

      return undefined;
    })
    .filter(Boolean)
    .filter(onlyUnique) as string[];
}

function onlyUnique<T>(value: T, index: number, arr: T[]) {
  return arr.indexOf(value) === index;
}

interface Visible {
  usersCanSee(): Promise<List<UUID>>;
}

interface PubSub {
  updatePost(id: UUID, options?: { onlyForUsers: List<UUID> }): Promise<void>;
}

export async function notifyBacklinkedLater(entity: Visible, pubSub: PubSub, uuids: UUID[]) {
  if (uuids.length === 0) {
    return () => Promise.resolve();
  }

  const prevViewers = await entity.usersCanSee();
  return () => notifyBacklinkedNow(entity, pubSub, uuids, prevViewers);
}

export async function notifyBacklinkedNow(
  entity: Visible,
  pubSub: PubSub,
  uuids: UUID[],
  prevViewers = List.empty() as List<UUID>,
) {
  const viewers = await entity.usersCanSee();
  const onlyForUsers = List.union(prevViewers, viewers);
  await Promise.all(
    // Notify mentioned posts
    uuids.map((id) => pubSub.updatePost(id, { onlyForUsers })),
  );
}
