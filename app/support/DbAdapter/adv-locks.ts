import type { Knex } from 'knex';

import type { Branded, UUID } from '../types';

export type LockType = Branded<number, 'advisoryLockType'>;

export const USER_SUBSCRIPTIONS: LockType = 10001;
export const JOBS_FETCH: LockType = 10002;

export async function advisoryLock(trx: Knex.Transaction, lockType: LockType) {
  await trx.raw(`select pg_advisory_xact_lock(:lockType)`, { lockType });
}

export async function lockByUUID(trx: Knex.Transaction, lockType: LockType, uuid: UUID) {
  await trx.raw(`select pg_advisory_xact_lock(:lockType, :id)`, { lockType, id: uuidToInt(uuid) });
}

/**
 * Extracts a 32-bit signed integer from the first 8 characters of the UUID. It
 * is not a very good approach, but unfortunately the Postgres advisory lock
 * functions cannot receive the full 128-bit UUIDs.
 *
 * @param uuid
 */
function uuidToInt(uuid: UUID): number {
  return Number.parseInt(uuid.substring(0, 8), 16) & 0xffffffff;
}
