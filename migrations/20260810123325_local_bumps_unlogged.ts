import type { Knex } from 'knex';

// local_bumps is disposable feed-ordering state that naturally repopulates after a crash.
// Keep it unlogged to avoid WAL for its high-churn heap and indexes.
export const up = (knex: Knex) => knex.schema.raw(`alter table local_bumps set unlogged`);

export const down = (knex: Knex) => knex.schema.raw(`alter table local_bumps set logged`);
