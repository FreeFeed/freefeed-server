declare module 'koa-methodoverride' {
  import { Request, Middleware } from 'koa';

  function methodOverride(fn: (req: Request) => string): Middleware;

  export = methodOverride;
}
