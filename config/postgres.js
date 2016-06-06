import knexjs from 'knex'

import { load as configLoader } from "./config"

const config = configLoader()

let knex = knexjs(config.postgres)

export function connect() {
  return knex
}

export async function configure(){
  return knex.raw("SET enable_seqscan TO off")
}
