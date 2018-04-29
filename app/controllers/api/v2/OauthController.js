import { URL } from 'url';
import passport from 'koa-passport';
import { capitalize, get } from 'lodash';

import { getAuthParams, getAuthzParams, renderCallbackResponse } from '../../../../config/initializers/passport.js'
import { getAllFriends as getAllFacebookFriends } from '../../../support/facebookGraphApi';
import { serializeUser } from '../../../serializers/v2/user';
import { dbAdapter } from '../../../models';

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

  static async authorize(ctx) {
    const { provider } = ctx.params;
    const { user } = ctx.state;

    let authzParams;
    try {
      authzParams = getAuthzParams(provider);
    } catch (e) {
      ctx.status = 404;
      return;
    }

    if (!user) {
      ctx.body = renderCallbackResponse({ error: 'Unauthorized' });
      return
    }

    if (!get(user, ['providers', provider, 'id'])) {
      ctx.body = renderCallbackResponse({ error: `You must have a #{capitalize(provider)} account linked` });
      return;
    }

    try {
      cacheOrigin(ctx);
    } catch (e) {
      ctx.body = renderCallbackResponse({ error: 'Referer must be present' });
      return;
    }

    await passport.authorize(`${provider}-authz`, authzParams)(ctx);
  }

  static async authorizeCallback(ctx) {
    const { provider } = ctx.params;

    let authzParams;
    try {
      authzParams = getAuthzParams(provider);
    } catch (e) {
      ctx.status = 404;
      return;
    }

    if (!ctx.state.user) {
      ctx.body = renderCallbackResponse({ error: 'Unauthorized' });
      return
    }

    await passport.authorize(`${provider}-authz`, authzParams, (error) => {
      // Process internal passport errors
      if (error) {
        ctx.body = renderCallbackResponse({ error: error || 'Unknown error' });
        return;
      }
    })(ctx);
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

  static async facebookFriends(ctx) {
    const { user } = ctx.state;

    if (!user) {
      ctx.status = 401;
      ctx.body = { err: 'Unauthorized' };
      return;
    }

    const facebookId = get(user, 'providers.facebook.id');
    if (!facebookId) {
      ctx.status = 403;
      ctx.body = { err: `You must have a Facebook account linked` };
      return;
    }

    const accessToken = ctx.query.accessToken || get(user, 'providers.facebook.accessToken');
    const facebookFriends = await getAllFacebookFriends({ facebookId, accessToken });

    const friendIds = facebookFriends.map((friend) => friend.id);
    let users = [];
    if (friendIds.length > 0) {
      users = await dbAdapter.getUsersByProviderIds('facebook', friendIds);
      users = users.map((user) => serializeUser(user));
    }

    ctx.body = { users };
  }
}
