import { URL } from 'url';
import passport from 'koa-passport';
import { capitalize } from 'lodash';

import { getAuthParams, renderCallbackResponse } from '../../../../config/initializers/passport.js'

function cacheOrigin(ctx) {
  const { origin } = new URL(ctx.header.referer);

  // 10 min cookie to store origin for postMessage
  ctx.cookies.set('origin', origin, {
    maxAge:    1000 * 60 * 10,
    overwrite: true,
    signed:    true,
  });

  return origin;
}

export default class OauthController {
  static async authenticate(ctx) {
    const { provider } = ctx.params;

    let authParams;
    try {
      authParams = getAuthParams(provider);
    } catch (e) {
      ctx.status = 404;
      return;
    }

    try {
      cacheOrigin(ctx);
    } catch (e) {
      ctx.body = renderCallbackResponse({ error: 'Referer must be present' });
      return;
    }

    await passport.authenticate(provider, authParams)(ctx);
  }

  static async callback(ctx) {
    const { provider } = ctx.params;

    let authParams;
    try {
      authParams = getAuthParams(provider);
    } catch (e) {
      ctx.status = 404;
      return;
    }

    if (ctx.state.user) {
      await passport.authorize(provider, authParams, (error) => {
        // Process internal passport errors
        if (error) {
          ctx.body = renderCallbackResponse({ error: error || 'Unknown error' });
          return;
        }
      })(ctx);
    } else {
      await passport.authenticate(provider, authParams, (error, user) => {
        // Process internal passport errors
        if (error || !user) {
          ctx.body = renderCallbackResponse({ error: error || 'Unknown error' });
          return;
        }
      })(ctx);
    }
  }

  static async link(ctx) {
    const { provider } = ctx.params;

    let authParams;
    try {
      authParams = getAuthParams(provider);
    } catch (e) {
      ctx.status = 404;
      return;
    }

    try {
      cacheOrigin(ctx);
    } catch (e) {
      ctx.body = renderCallbackResponse({ error: 'Referer must be present' });
      return;
    }

    await passport.authorize(provider, authParams, (error) => {
      // Process internal passport errors
      if (error) {
        ctx.body = renderCallbackResponse({ error: error || 'Unknown error' });
        return;
      }
    })(ctx);
  }

  static async unlink(ctx) {
    const { provider } = ctx.params;

    try {
      getAuthParams(provider);
    } catch (e) {
      ctx.status = 404;
      return;
    }

    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Unauthorized' };
      return;
    }

    await ctx.state.user.unlinkProvider(provider);
    ctx.body = {
      message:   `${capitalize(provider)} account unlinked`,
      providers: ctx.state.user.providers,
    };
  }
}
