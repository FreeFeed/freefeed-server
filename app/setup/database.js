import { promisifyAll } from 'bluebird';
import redis from 'redis';
import createDebug from 'debug';
import Raven from 'raven';
import config from 'config';


promisifyAll(redis.RedisClient.prototype);
promisifyAll(redis.Multi.prototype);

const sentryIsEnabled = 'sentryDsn' in config;
const debug = createDebug('freefeed:database');
const options = {
  host: config.redis.host,
  port: config.redis.port,
  db:   config.database,
  ...config.redis.options,
};
const database = redis.createClient(options);
export default database;

database.on('connect', log('connect'));
database.on('ready', log('ready'));
database.on('reconnecting', log('reconnecting'));
database.on('end', log('end'));
database.on('error', logAndQuit('error'));

function log(type) {
  return function (...args) {
    debug(type, args);
  };
}

function logAndQuit(type) {
  return function (...args) {
    if (sentryIsEnabled) {
      Raven.captureException(args, { extra: { err: 'Unknown Redis error. Switching off server.' } });
    }

    debug(type, args);
    process.exit(1);
  };
}

export function connect() {
  return database;
}
