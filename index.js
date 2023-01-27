/* eslint babel/semi: "error" */
import consoleStamp from 'console-stamp';
import monitor from 'monitor-dog';

import { getSingleton as initApp } from './app/app';

consoleStamp(console, 'yyyy/mm/dd HH:MM:ss.l');

initApp()
  .then(() => {
    monitor.increment('app.init');
  })
  .catch((e) => {
    monitor.increment('app.crash');
    process.stderr.write(`FATAL ERROR\n`);
    process.stderr.write(`${e.message}\n`);
    process.stderr.write(`${e.stack}\n`);
    process.exit(1);
  });
