import { promisifyAll } from 'bluebird';
import jwt from 'jsonwebtoken';
import { Netmask } from 'netmask';
import createDebug from 'debug';
import Raven from 'raven';

import { load as configLoader } from '../../../config/config';
import { dbAdapter, SessionTokenV0, AppTokenV1 } from '../../models';
import { ForbiddenException } from '../../support/exceptions';
import { alwaysAllowedRoutes, appTokensScopes } from '../../models/app-tokens-scopes';


promisifyAll(jwt);
const config = configLoader();
const sentryIsEnabled = 'sentryDsn' in config;
const authDebug = createDebug('freefeed:authentication');

export async function withAuthToken(ctx, next) {
  let jwtToken;

  if (ctx.headers['authorization'] && ctx.headers['authorization'].startsWith('Bearer ')) {
    jwtToken = ctx.headers['authorization'].replace(/^Bearer\s+/, '');
  } else {
    jwtToken = ctx.headers['x-authentication-token']
     || ctx.request.body.authToken
     || ctx.query.authToken;
  }

  const authData = await tokenFromJWT(
    jwtToken,
    {
      headers:  ctx.headers,
      remoteIP: ctx.ip,
      route:    `${ctx.method} ${ctx._matchedRoute}`,
    },
  );

  if (!authData) {
    await next();
    return;
  }

  ctx.state = { ...ctx.state, ...authData };
  const { authToken } = authData;

  if (authToken instanceof AppTokenV1) {
    // Update IP and User-Agent
    await authToken.registerUsage({
      ip:        ctx.ip,
      userAgent: ctx.headers['user-agent'] || '<undefined>',
    });

    await next();

    try {
      await authToken.logRequest(ctx);
    } catch (e) {
      // We should not break request at this step
      // but we must log error
      authDebug(`cannot log app token usage: ${e.message}`);

      if (sentryIsEnabled) {
        Raven.captureException(e, { extra: { err: `cannot log app token usage: ${e.message}` } });
      }
    }
  } else {
    await next();
  }
}

/**
 * Parses JWT, checks token permissions and returns { authToken: AuthToken, user: User }
 * object or null. Null means that anonymous access is granted. This function
 * throws ForbiddenException if the request cannot be proceed with this token.
 *
 * @param {string} jwtToken
 * @param {object} context
 * @throws {ForbiddenException}
 */
export async function tokenFromJWT(
  jwtToken,
  { // Extract from ctx data
    headers = {},
    remoteIP = '0.0.0.0',
    route = '',
  },
) {
  if (!jwtToken) {
    return null;
  }

  authDebug('got JWT token', jwtToken);

  let decoded = null;

  try {
    decoded = await jwt.verifyAsync(jwtToken, config.secret);
  } catch (e) {
    authDebug(`invalid JWT, the user will be treated as anonymous: ${e.message}`);
    return null;
  }

  // Session token v0 (legacy)
  if (!decoded.type && decoded.userId) {
    const token = new SessionTokenV0(decoded.userId);
    const user = await dbAdapter.getUserById(token.userId);

    if (!user || !user.isActive) {
      authDebug(`user ${token.userId} is not exists or is not active`);
      return null;
    }

    authDebug(`authenticated as ${user.username} with ${token.constructor.name} token`);
    return { authToken: token, user };
  }

  // Application token v1
  if (decoded.type === AppTokenV1.TYPE) {
    const token = await dbAdapter.getActiveAppTokenByIdAndIssue(decoded.id, decoded.issue);

    if (!token) {
      authDebug(`app token ${decoded.id} / ${decoded.issue} is not exists`);
      throw new ForbiddenException(`token is invalid or outdated`);
    }

    // Restrictions (IPs and origins)
    {
      const { netmasks = [], origins = [] } = token.restrictions;

      if (netmasks.length > 0 && !netmasks.some((mask) => new Netmask(mask).contains(remoteIP))) {
        authDebug(`app token is not allowed from IP ${remoteIP}`)
        throw new ForbiddenException(`token is not allowed from this IP`);
      }

      if (origins.length > 0 && !origins.includes(headers.origin)) {
        authDebug(`app token is not allowed from origin ${headers.origin}`)
        throw new ForbiddenException(`token is not allowed from this origin`);
      }
    }

    // Route access
    {
      const routeAllowed = alwaysAllowedRoutes.includes(route)
      || appTokensScopes.some(({ name, routes }) => token.scopes.includes(name) && routes.includes(route));

      if (!routeAllowed) {
        authDebug(`app token has no access to '${route}'`);
        throw new ForbiddenException(`token has no access to this API method`);
      }
    }

    const user = await dbAdapter.getUserById(token.userId);

    if (!user || !user.isActive) {
      authDebug(`user ${token.userId} is not exists or is not active`);
      throw new ForbiddenException(`user is not exists`);
    }

    authDebug(`authenticated as ${user.username} with ${token.constructor.name} token`);
    return { authToken: token, user };
  }

  // Unknow token
  authDebug(`unknown token type: ${decoded.type}`);
  return null;
}
