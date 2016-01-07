import bluebird from 'bluebird'
import consoleStamp from 'console-stamp'
import express from 'express'
import http from 'http'

import PubsubListener from './app/pubsub-listener'
import routesInit from './app/routes'


global.Promise = bluebird
global.Promise.onPossiblyUnhandledRejection((e) => { throw e; });

consoleStamp(console, 'yyyy/mm/dd HH:MM:ss.l')

const app = express()
export default app

async function init() {
  const environment = require('./config/environment')
  const server = http.createServer(app)

  await environment.init(app)
  routesInit(app)

  const port = (process.env.PEPYATKA_SERVER_PORT || app.get('port'))

  server.listen(port, () => {
    const mode = process.env.NODE_ENV || "development"

    app.logger.info(`Express server is listening on port ${port}`);
    app.logger.info(`Server is running in ${mode} mode`)
  })
}

init()
  .then(() => {
    app.logger.info(`Server initialization is complete`)
  })
  .catch((e) => {
    process.stderr.write(`${e.message}\n`)
    process.exit(1)
  })
