/* eslint babel/semi: "error" */
import http from 'http';

import AwaitLock from 'await-lock';
import { promisifyAll } from 'bluebird';
import createDebug from 'debug';

import FreefeedApp from './freefeed-app';
import routesInit from './routes';
import PubsubListener from './pubsub-listener';
import { initJobProcessing } from './jobs';
import { init as initEnvironment } from './setup/environment';


let app = null;
promisifyAll(http);

const lock = new AwaitLock();

export async function getSingleton() {
  if (app !== null) {
    return app;
  }

  await lock.acquireAsync();

  try {
    if (app !== null) {
      return app;
    }

    await initEnvironment();

    const _app = new FreefeedApp();
    routesInit(_app);
    await initJobProcessing(_app);

    const server = http.createServer(_app.callback());
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
