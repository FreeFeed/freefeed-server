import bluebird from 'bluebird'
import consoleStamp from 'console-stamp'

import { getSingleton as initApp } from './app/app'


global.Promise = bluebird
global.Promise.onPossiblyUnhandledRejection((e) => { throw e; });

consoleStamp(console, 'yyyy/mm/dd HH:MM:ss.l')

initApp()
  .then((app) => {
    app.logger.info(`Server initialization is complete`)
  })
  .catch((e) => {
    process.stderr.write(`FATAL ERROR\n`)
    process.stderr.write(`${e.message}\n`)
    process.stderr.write(`${e.stack}\n`)
    process.exit(1)
  })
