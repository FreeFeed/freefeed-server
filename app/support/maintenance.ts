import { promises as fs } from 'fs';

import config from 'config';
import createDebug from 'debug';
import Koa from 'koa';


const debug = createDebug('freefeed:maintenanceCheck');
const { messageFile } = config.maintenance;

export async function maintenanceCheck(ctx: Koa.Context, next: Koa.Next) {
  try {
    const message = await fs.readFile(messageFile, { encoding: 'utf8' });

    if (/\/v\d+\//.test(ctx.url) && ctx.request.method === 'OPTIONS') {
      // Allow OPTIONS requests for API-like endpoints
      ctx.status = 200;
    } else {
      // Return 503 for all other requests
      ctx.status = 503;
      ctx.body = { err: message, errType: 'ServiceUnavailable.Maintenance' };
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      debug(`Cannot read existing maintenance file: ${err.message}`);
    }

    await next();
  }
}
