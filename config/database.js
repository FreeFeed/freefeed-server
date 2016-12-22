import { promisifyAll } from 'bluebird'
import _redis from 'redis'

import { load as configLoader } from './config'


promisifyAll(_redis.RedisClient.prototype)
promisifyAll(_redis.Multi.prototype)

const config = configLoader()
let database = _redis.createClient(config.redis.port, config.redis.host, config.redis.options)
export default database;

// TODO: move to app.context.logger
database.on('connect', log('connect'))
database.on('ready', log('ready'))
database.on('reconnecting', log('reconnecting'))
database.on('error', logAndQuit('error'))
database.on('end', log('end'))

function log(type) {
  return function (...args) {
    console.log(type, args);  // eslint-disable-line no-console
  }
}

function logAndQuit(type) {
  return function (...args) {
    console.log(type, args);  // eslint-disable-line no-console
    process.exit(1);
  }
}

export async function selectDatabase() {
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
