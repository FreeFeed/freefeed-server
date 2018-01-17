import { promisifyAll } from 'bluebird'
import _redis from 'redis'
import createDebug from 'debug';

import { load as configLoader } from './config'


promisifyAll(_redis.RedisClient.prototype)
promisifyAll(_redis.Multi.prototype)

const config = configLoader()
const debug = createDebug('freefeed:database');
let database = _redis.createClient(config.redis.port, config.redis.host, config.redis.options)
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
    debug(type, args);
    process.exit(1);
  };
}

export function selectDatabase() {
  return database.selectAsync(config.database)
}

export function connect() {
  return database
}

export function redis() {
  return redis
}

export function disconnect() {
  _redis.end()
  database = null
}
