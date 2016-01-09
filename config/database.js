import { promisifyAll } from 'bluebird'
import _redis from 'redis'

import { load as configLoader } from "./config"


promisifyAll(_redis.RedisClient.prototype)
promisifyAll(_redis.Multi.prototype)

const config = configLoader()
let database = _redis.createClient(config.redis.port, config.redis.host, config.redis.options)

// TODO: move to app.logger
database.on('connect'     , log('connect'))
database.on('ready'       , log('ready'))
database.on('reconnecting', log('reconnecting'))
database.on('error'       , logAndQuit('error'))
database.on('end'         , log('end'))

function log(type) {
  return function() {
    console.log(type, arguments)
  }
}

function logAndQuit(type) {
  return function() {
    console.log(type, arguments)
    process.exit(1)
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
