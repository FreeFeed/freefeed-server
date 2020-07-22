/* eslint babel/semi: "error" */
import http from 'http';

import AwaitLock from 'await-lock';
import { promisifyAll } from 'bluebird';
import createDebug from 'debug';
import Application from 'koa';

import routesInit from './routes';
import PubsubListener from './pubsub-listener';
import { initJobProcessing } from './jobs';


let app = null;
promisifyAll(http);

const lock = new AwaitLock();

export async function getSingleton() {
  await lock.acquireAsync();

  try {
    if (app !== null) {
      return app;
    }

    const _app = new Application();

    const environment = require('./setup/environment');
    const server = http.createServer(_app.callback());

    await environment.init(_app);
    routesInit(_app);
    initJobProcessing();

    _app.context.pubsub = new PubsubListener(server, _app);

    const port = (process.env.PEPYATKA_SERVER_PORT || process.env.PORT || _app.context.config.port);
    await server.listenAsync(port);

    const log = createDebug('freefeed:init');

    log(`Koa server is listening on port ${port}`);
    log(`Server is running in ${_app.env} mode`);

    app = _app;

    return app;
  } finally {
    lock.release();
  }
}
