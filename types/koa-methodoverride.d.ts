declare module 'koa-methodoverride' {
  import type { Request, Middleware } from 'koa';

  function methodOverride(fn: (req: Request) => string): Middleware;

  export = methodOverride;
}
