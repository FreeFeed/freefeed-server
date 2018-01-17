import bb from 'bluebird'
import consoleStamp from 'console-stamp'

import { getSingleton as initApp } from './app/app'

require('babel-runtime/core-js/promise').default = bb;
global.Promise = bb;

bb.config({ longStackTraces: process.env.NODE_ENV !== 'production' });
if ('__NR_original' in bb.coroutine) {
  // newrelic 2.6.0 hides original object
  bb.coroutine.__NR_original.addYieldHandler((value) => bb.resolve(value));
} else {
  bb.coroutine.addYieldHandler((value) => bb.resolve(value));
}
bb.onPossiblyUnhandledRejection((e) => {
  console.error('Unhandled Exception', e);
});

consoleStamp(console, 'yyyy/mm/dd HH:MM:ss.l')

initApp()
  .catch((e) => {
    process.stderr.write(`FATAL ERROR\n`)
    process.stderr.write(`${e.message}\n`)
    process.stderr.write(`${e.stack}\n`)
    process.exit(1)
  })
