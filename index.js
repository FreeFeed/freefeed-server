/* eslint babel/semi: "error" */
import consoleStamp from 'console-stamp';

import { getSingleton as initApp } from './app/app';

consoleStamp(console, 'yyyy/mm/dd HH:MM:ss.l');

initApp().catch((e) => {
  process.stderr.write(`FATAL ERROR\n`);
  process.stderr.write(`${e.message}\n`);
  process.stderr.write(`${e.stack}\n`);
  process.exit(1);
});
