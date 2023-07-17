import { AsyncLocalStorage } from 'async_hooks';

import defaultConfig, { type Config } from 'config';
import { Middleware } from 'koa';

type AppAsyncContext = {
  config: Config;
};

const appAsyncContext = new AsyncLocalStorage<AppAsyncContext>();

export const asyncContextMiddleware: Middleware = (ctx, next) =>
  appAsyncContext.run({ config: ctx.config }, next);

/**
 * Returns the current application configuration for use in functions called
 * directly or indirectly by controllers. It allows to not explicitly pass
 * 'context' or 'config' to these functions. If not called from the controller
 * context, it returns the current server config.
 *
 * @returns Config
 */
export function currentConfig(): Config {
  return appAsyncContext.getStore()?.config ?? defaultConfig;
}
