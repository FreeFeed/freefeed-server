import { promisifyAll } from 'bluebird';
import jwt from 'jsonwebtoken';
import createDebug from 'debug';
import Raven from 'raven';
import config from 'config'

import { dbAdapter, SessionTokenV0, AppTokenV1 } from '../../models';
import { NotAuthorizedException } from '../../support/exceptions';
import { alwaysAllowedRoutes, appTokensScopes, alwaysDisallowedRoutes } from '../../models/auth-tokens/app-tokens-scopes';
import { Address } from '../../support/ipv6';


promisifyAll(jwt);
const sentryIsEnabled = 'sentryDsn' in config;
const authDebug = createDebug('freefeed:authentication');

export async function withAuthToken(ctx, next) {
  let jwtToken;

  if (ctx.headers['authorization']) {
    if (!ctx.headers['authorization'].startsWith('Bearer ')) {
      throw new NotAuthorizedException(`invalid Authorization header, use 'Bearer' scheme`);
    }

    jwtToken = ctx.headers['authorization'].replace(/^Bearer\s+/, '');
  } else {
    jwtToken = ctx.headers['x-authentication-token']
      || ctx.request.body.authToken
      || ctx.query.authToken;
  }

  if (!jwtToken) {
    await next();
    return;
  }

  const authData = await tokenFromJWT(
    jwtToken,
    {
      headers:  ctx.headers,
      remoteIP: ctx.ip,
      route:    `${ctx.method === 'HEAD' ? 'GET' : ctx.method} ${ctx.state.matchedRoute}`,
    },
  );

  ctx.state = { ...ctx.state, ...authData };
  const { authToken } = authData;

  if (authToken instanceof AppTokenV1) {
    // Update IP and User-Agent
    await authToken.registerUsage({
      // Beautify address for user: remove ::ffff: prefix from IPv4 addresses
      ip:        new Address(ctx.ip).toString(),
      userAgent: ctx.headers['user-agent'],
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
 * object. This function throws ForbiddenException if the request cannot be proceed with
 * this token or token has an invalid format/unknown type.
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
  authDebug('got JWT token', jwtToken);

  let decoded = null;

  try {
    decoded = await jwt.verifyAsync(jwtToken, config.secret);
  } catch (e) {
    authDebug(`invalid JWT: ${e.message}`);
    throw new NotAuthorizedException(`invalid token: bad JWT`);
  }

  // Session token v0 (legacy)
  if (!decoded.type && decoded.userId) {
    const token = new SessionTokenV0(decoded.userId);
    const user = await dbAdapter.getUserById(token.userId);

    if (!user || !user.isActive) {
      authDebug(`user ${token.userId} is not exists or is not active`);
      throw new NotAuthorizedException(`user ${token.userId} is not exists or is not active`);
    }

    authDebug(`authenticated as ${user.username} with ${token.constructor.name} token`);
    return { authToken: token, user };
  }

  // Application token v1
  if (decoded.type === AppTokenV1.TYPE) {
    const token = await dbAdapter.getActiveAppTokenByIdAndIssue(decoded.id, decoded.issue);

    if (!token) {
      authDebug(`app token ${decoded.id} / ${decoded.issue} is not exists`);
      throw new NotAuthorizedException(`token is invalid or outdated`);
    }

    // Restrictions (IPs and origins)
    try {
      token.checkRestrictions({ remoteIP, headers });
    } catch (e) {
      authDebug(e.message)
      throw new NotAuthorizedException(e.message);
    }

    // Route access
    {
      const routeAllowed =
        !alwaysDisallowedRoutes.includes(route) && (
          alwaysAllowedRoutes.includes(route)
          || appTokensScopes.some(({ name, routes }) => token.scopes.includes(name) && routes.includes(route))
        );

      if (!routeAllowed) {
        authDebug(`app token has no access to '${route}'`);
        throw new NotAuthorizedException(`token has no access to this API method`);
      }
    }

    const user = await dbAdapter.getUserById(token.userId);

    if (!user || !user.isActive) {
      authDebug(`user ${token.userId} is not exists or is not active`);
      throw new NotAuthorizedException(`user is not exists`);
    }

    authDebug(`authenticated as ${user.username} with ${token.constructor.name} token`);
    return { authToken: token, user };
  }

  // Unknow token
  authDebug(`unknown token type: ${decoded.type}`);
  throw new NotAuthorizedException(`unknown token type: ${decoded.type}`);
}
