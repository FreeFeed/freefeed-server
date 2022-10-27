import { Context, Next } from 'koa';

import { CURRENT_VERSION, MIN_SUPPORTED_VERSION } from '../../api-versions';

export async function apiVersionMiddleware(ctx: Context, next: Next) {
  const match = /\/v([1-9]\d*)\//.exec(ctx.url);

  if (!match) {
    await next();
    return;
  }

  let apiVersion = Number.parseInt(match[1], 10);

  if (apiVersion > CURRENT_VERSION) {
    ctx.status = 404;
    ctx.body = { err: `Unknown API version ${apiVersion}` };
    return;
  }

  if (apiVersion < MIN_SUPPORTED_VERSION) {
    apiVersion = MIN_SUPPORTED_VERSION;
  }

  ctx.state.apiVersion = apiVersion;
  ctx.response.set('FreeFeed-API-Version', apiVersion.toString(10));

  await next();
}
