import { xor } from 'lodash';

import { List } from './open-lists';
import { UUID } from './types';

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

export const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
export function extractUUIDs(text: string | null): UUID[] {
  return text ? [...text.matchAll(uuidRe)].map((m) => m[0]).filter(onlyUnique) : [];
}

export const shortLinkRe = /\/[A-Za-z0-9-]{3,35}\/([0-9a-f]{6,10})/gi;
export function extractShortIds(text: string | null): string[] {
  return text ? [...text.matchAll(shortLinkRe)].map((m) => m[1]).filter(onlyUnique) : [];
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
