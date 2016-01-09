import http from 'http'

import { promisifyAll } from 'bluebird'
import express from 'express'

import routesInit from './routes'
import PubsubListener from './pubsub-listener'


let app = null
promisifyAll(http)

export async function getSingleton() {
  if (app !== null) {
    return app
  }

  const _app = express()

  const environment = require('../config/environment')
  const server = http.createServer(_app)

  await environment.init(_app)
  routesInit(_app)

  _app.pubsub = new PubsubListener(server, _app)

  const port = (process.env.PEPYATKA_SERVER_PORT || _app.get('port'))
  await server.listenAsync(port)

  const mode = process.env.NODE_ENV || "development"

  _app.logger.info(`Express server is listening on port ${port}`);
  _app.logger.info(`Server is running in ${mode} mode`)

  app = _app

  return app
}
