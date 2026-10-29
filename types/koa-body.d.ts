import { type File } from 'formidable';
import { type Middleware } from 'koa';

import { type KoaBodyMiddlewareOptions } from '../node_modules/koa-body/dist/esm/types';

// Stands in for the package's own index.d.ts, see "paths" in tsconfig.json.
export declare function koaBody(options?: Partial<KoaBodyMiddlewareOptions>): Middleware;

declare module 'koa' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Request {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body?: any;
    files?: Record<string, File | File[]>;
  }
}
