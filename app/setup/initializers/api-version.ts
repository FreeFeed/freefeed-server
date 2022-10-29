import { Context, Next } from 'koa';

import { API_VERSION_ACTUAL, API_VERSION_MINIMAL } from '../../api-versions';

export async function apiVersionMiddleware(ctx: Context, next: Next) {
  const match = /\/v([1-9]\d*)\//.exec(ctx.url);

  if (!match) {
    await next();
    return;
  }

  let apiVersion = Number.parseInt(match[1], 10);

  if (apiVersion > API_VERSION_ACTUAL) {
    ctx.status = 404;
    ctx.body = { err: `Unknown API version ${apiVersion}` };
    return;
  }

  if (apiVersion < API_VERSION_MINIMAL) {
    apiVersion = API_VERSION_MINIMAL;
  }

  ctx.state.apiVersion = apiVersion;
  ctx.response.set('FreeFeed-API-Version', apiVersion.toString(10));

  await next();
}
