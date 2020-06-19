import Knex from 'knex';


type Branded<T, B extends string> = T & { __brand?: B;}

// Some useful type aliases
export type UUID = Branded<string, 'uuid'>
export type LockType = Branded<number, 'advisoryLockType'>

export const USER_SUBSCRIPTIONS: LockType = 10001;


export async function lockByUUID(trx: Knex.Transaction, lockType: LockType, uuid: UUID) {
  await trx.raw(`select pg_advisory_xact_lock(:lockType, :id)`,
    { lockType, id: uuidToInt(uuid) });
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
