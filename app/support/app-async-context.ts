import { AsyncLocalStorage } from 'async_hooks';

import defaultConfig, { type Config } from 'config';
import { Middleware } from 'koa';

type AppAsyncContext = {
  config: Config;
};

const appAsyncContext = new AsyncLocalStorage<AppAsyncContext>();

export const asyncContextMiddleware: Middleware = (ctx, next) =>
  appAsyncContext.run({ config: ctx.config }, next);

let explicitConfig: Config | null = null;

/**
 * Allows to set the explicit config for the test purposes. It returns the
 * rollback function that restores the previous config. The currentConfig()
 * function will return the passed configuration until the rollback function is
 * called.
 */
export function setExplicitConfig(cfg: Config): () => void {
  const prevCfg = explicitConfig;
  explicitConfig = cfg;
  return () => {
    explicitConfig = prevCfg;
  };
}

/**
 * Returns the current application configuration for use in functions called
 * directly or indirectly by controllers. It allows to not explicitly pass
 * 'context' or 'config' to these functions. If not called from the controller
 * context, it returns the current server config.
 *
 * @returns Config
 */
export function currentConfig(): Config {
  return explicitConfig ?? appAsyncContext.getStore()?.config ?? defaultConfig;
}
