import knexjs from 'knex'
import * as logger from '../app/support/debugLogger';
import { load as configLoader } from './config'

const config = configLoader()

const knex = knexjs(config.postgres)

if (logger.isEnabledFor('sql')) {
  const log = logger.get('sql');

  knex.on('start', (builder) => {
    const q = builder.toString();
    const start = new Date().getTime();
    builder.on('end', () => {
      log('%s %s', q, logger.stylize(`${new Date().getTime() - start}ms`, 'green'));
    });
  });
}

export function connect() {
  return knex
}

export async function configure() {
  const textSearchConfigName = config.postgres.textSearchConfigName
  return knex.raw(`SET default_text_search_config TO '${textSearchConfigName}'`)
}
