import type { Files } from 'formidable';
import 'koa';

// koa-body augments the @types/koa copy resolved from its own dependency tree.
// When the application resolves a different @types/koa version, that augmentation
// is not applied to Koa.Request and TypeScript reports TS2339 for request.body.
// Declare the koa-body request fields locally so they are available consistently.
declare module 'koa' {
  // Module augmentation requires an interface, and the types must match koa-body.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Request {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body?: any;
    files?: Files;
  }
}
