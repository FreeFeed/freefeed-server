import { URL } from 'url';

import passport from 'koa-passport';
import { capitalize } from 'lodash';

import { getAuthParams, getAuthzParams, renderCallbackResponse } from '../../../../config/initializers/passport.js'
import { getAllFriends as getAllFacebookFriends, NeedReauthorization } from '../../../support/facebookGraphApi';
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

  static async authenticateCallback(ctx) {
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
      ctx.body = renderCallbackResponse({ error: 'You are not logged in' });
      return;
    }

    const authMethods = await user.getAuthMethods({ providerName: provider });

    if (!authMethods.length) {
      ctx.body = renderCallbackResponse({ error: `You must have a ${capitalize(provider)} account linked` });
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
      ctx.body = renderCallbackResponse({ error: 'You are not logged in' });
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
    const { provider, providerId } = ctx.params;

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

    await ctx.state.user.removeAuthMethod(provider, providerId);
    const authMethods = await ctx.state.user.getAuthMethods();

    ctx.body = {
      message: `${capitalize(provider)} account unlinked`,
      authMethods,
    };
  }

  static async userAuthMethods(ctx) {
    const { user } = ctx.state;

    if (!user) {
      ctx.status = 401;
      ctx.body = { err: 'Unauthorized' };
      return;
    }

    const authMethods = await user.getAuthMethods();
    ctx.body = { authMethods };
  }

  static async facebookFriends(ctx) {
    const { user } = ctx.state;

    if (!user) {
      ctx.status = 401;
      ctx.body = { err: 'Unauthorized' };
      return;
    }

    const authMethod = await user.getAuthMethod({
      providerName: 'facebook',
      providerId:   ctx.params.providerId,
    });

    if (!authMethod) {
      ctx.status = 403;
      ctx.body = {
        err:        'You must have a Facebook account linked',
        facebookId: ctx.params.providerId
      };
      return;
    }

    const accessToken = ctx.query.accessToken || authMethod.accessToken;
    let facebookFriends;

    try {
      facebookFriends = await getAllFacebookFriends({ facebookId: authMethod.providerId, accessToken })
    } catch (e) {
      if (e instanceof NeedReauthorization) {
        ctx.status = 400;
        ctx.body = {
          err:                 'Access token expired',
          facebookId:          authMethod.providerId,
          needReauthorization: true,
        };
      } else {
        ctx.status = 500;
        ctx.body = {
          err:        'Unknown error',
          facebookId: authMethod.providerId,
        };
      }

      return;
    }

    const friendIds = facebookFriends.map((friend) => friend.id);
    let users = [];

    if (friendIds.length > 0) {
      users = await dbAdapter.getUsersByProviderIds('facebook', friendIds);
      users = users.map(serializeUser);
    }

    ctx.body = { users };
  }

  /**
   * Fetches friends for each linked facebook account.
   */
  static async allFacebookFriends(ctx) {
    const { user } = ctx.state;

    if (!user) {
      ctx.status = 401;
      ctx.body = { err: 'Unauthorized' };
      return;
    }

    const authMethods = await user.getAuthMethods({ providerName: 'facebook' });
    const friends = {};

    for (const authMethod of authMethods) {
      friends[authMethod.providerId] = {};
      const accessToken = ctx.query.accessToken || authMethod.accessToken;

      if (!accessToken) {
        friends[authMethod.providerId] = { err: 'Access token expired', needReauthorization: true };
        continue;
      }

      let facebookFriends;

      try {
        // eslint-disable-next-line no-await-in-loop
        facebookFriends = await getAllFacebookFriends({ facebookId: authMethod.providerId, accessToken })
      } catch (e) {
        if (e instanceof NeedReauthorization) {
          friends[authMethod.providerId] = { err: 'Access token expired', needReauthorization: true };
          continue;
        } else {
          throw e
        }
      }

      const friendIds = facebookFriends.map((friend) => friend.id);
      let users = [];

      if (friendIds.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        users = await dbAdapter.getUsersByProviderIds('facebook', friendIds);
        users = users.map(serializeUser);
      }

      friends[authMethod.providerId].users = users;
    }

    ctx.body = friends;
  }
}
