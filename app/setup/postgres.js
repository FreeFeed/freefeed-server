/* eslint babel/semi: "error" */
import knexjs from 'knex';
import createDebug from 'debug';
import config from 'config';

import { stylize } from '../support/debugLogger';

const knex = knexjs(config.postgres);
const log = createDebug('freefeed:sql');
const errLog = createDebug('freefeed:sql:error');

knex.on('start', (builder) => {
  const q = builder.toString();
  const start = new Date().getTime();

  builder.on('end', () => {
    log('%s %s', q, stylize(`[took ${new Date().getTime() - start}ms]`, 'green'));
  });

  builder.on('error', () => {
    errLog('%s %s', stylize('ERROR', 'red'), q);
  });
});

export function connect() {
  return knex;
}

export function setSearchConfig() {
  const { textSearchConfigName } = config.postgres;
  return knex.raw(`SET default_text_search_config TO '${textSearchConfigName}'`);
}
