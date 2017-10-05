import bb from 'bluebird'
import consoleStamp from 'console-stamp'

import { getSingleton as initApp } from './app/app'

require('babel-runtime/core-js/promise').default = bb;
global.Promise = bb;

bb.config({ longStackTraces: process.env.NODE_ENV !== 'production' });
bb.coroutine.addYieldHandler((value) => bb.resolve(value));
bb.onPossiblyUnhandledRejection((e) => {
  console.error('Unhandled Exception', e);
});

consoleStamp(console, 'yyyy/mm/dd HH:MM:ss.l')

initApp()
  .then((app) => {
    app.context.logger.info(`Server initialization is complete`)
  })
  .catch((e) => {
    process.stderr.write(`FATAL ERROR\n`)
    process.stderr.write(`${e.message}\n`)
    process.stderr.write(`${e.stack}\n`)
    process.exit(1)
  })
