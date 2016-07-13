import knexjs from 'knex'

import { load as configLoader } from "./config"

const config = configLoader()

let knex = knexjs(config.postgres)

export function connect() {
  return knex
}

export async function configure(){
  const textSearchConfigName = config.postgres.textSearchConfigName
  return knex.raw(`SET default_text_search_config TO '${textSearchConfigName}'`)
}
