import util from 'util';

import jwt from 'jsonwebtoken';
import config from 'config';
import { Middleware, DefaultState } from 'koa';

import { type FreefeedContext } from '../../freefeed-app';
import { NotAuthorizedException } from '../../support/exceptions';
import { authDebugError, AuthToken, SessionTokenV1, AppTokenV1 } from '../../models/auth-tokens';
import { sessionTokenV1Store } from '../../models';
import { Nullable } from '../../support/types';

declare module 'jsonwebtoken' {
  export function verifyAsync(token: string, secret: string): Promise<object | undefined>;
}

jwt.verifyAsync = util.promisify(jwt.verify);

export const withAuthToken: Middleware<DefaultState, FreefeedContext> = async (ctx, next) => {
  let jwtToken;

  if (ctx.headers['authorization']) {
    // The Bearer authorization scheme
    if (!ctx.headers['authorization'].startsWith('Bearer ')) {
      throw new NotAuthorizedException(`invalid Authorization header, use 'Bearer' scheme`);
    }

    jwtToken = ctx.headers['authorization'].replace(/^Bearer\s+/, '');
  } else {
    // The legacy X-Authentication-Token header
    jwtToken =
      ctx.headers['x-authentication-token'] || ctx.request.body.authToken || ctx.query.authToken;
  }

  if (!jwtToken) {
    // Not authenticated
    await next();
    return;
  }

  let payload: any;

  try {
    payload = await jwt.verifyAsync(jwtToken, config.secret);
  } catch (e: unknown) {
    authDebugError(`invalid JWT`, { error: e });
    throw new NotAuthorizedException(`invalid auth token: bad JWT`);
  }

  let authToken: Nullable<AuthToken>;

  if (payload.type === SessionTokenV1.TYPE) {
    // Session token v1
    authToken = await sessionTokenV1Store.getById(payload.id!);
  } else if (payload.type === AppTokenV1.TYPE) {
    // Application token v1
    authToken = await ctx.modelRegistry.dbAdapter.getAppTokenById(payload.id!);
  } else {
    authToken = null;
  }

  if (!authToken) {
    authDebugError(`auth token is not found`);
    throw new NotAuthorizedException(`auth token is not found`);
  }

  ctx.state = { ...ctx.state, authToken, authJWTPayload: payload };

  await authToken.middleware(ctx, next);
};
