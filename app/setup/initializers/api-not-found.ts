import { Context, Next } from 'koa';

export async function apiNotFoundMiddleware(ctx: Context, next: Next) {
  if (ctx.state.apiVersion) {
    if (ctx.request.method === 'OPTIONS') {
      ctx.status = 200;
      return;
    }

    ctx.status = 404;
    ctx.body = { err: `API method not found: '${ctx.url}'` };
    return;
  }

  await next();
}
