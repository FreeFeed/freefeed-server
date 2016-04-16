import bluebird from 'bluebird'

global.Promise = bluebird
global.Promise.onPossiblyUnhandledRejection((e) => { throw e; });

import { selectDatabase } from './config/database'
import { connect as redisConnection } from './config/database'
import { connect as postgresConnection } from './config/postgres'
import { PgAdapter } from './data_transfer/PgAdapter'


const postgres = postgresConnection()
const pgAdapter = new PgAdapter(postgres)
let redis

async function main(){
  console.log("Started")
  await selectDatabase()
  redis = redisConnection()
  console.log("Redis initialized")
}

main().then(()=> {
  console.log("Finished")
  process.exit(0)
})