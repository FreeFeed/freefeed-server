import crypto from 'crypto';

import { promisifyAll } from 'bluebird';
import jwt from 'jsonwebtoken';
import config from 'config';
import { Context, Next } from 'koa';
import { v4 as uuidv4 } from 'uuid';

import { NotAuthorizedException } from '../../support/exceptions';
import { authDebugError, AuthToken, SessionTokenV1 } from '../../models/auth-tokens';
import { AppTokenV1, dbAdapter, sessionTokenV1Store } from '../../models';
import { Nullable } from '../../support/types';

promisifyAll(jwt);

declare module 'jsonwebtoken' {
  export function verifyAsync<T>(token: string, secret: string): Promise<T>;
}

export async function withAuthToken(ctx: Context, next: Next) {
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
  } catch (e) {
    authDebugError(`invalid JWT: ${e.message}`);
    throw new NotAuthorizedException(`invalid auth token: bad JWT`);
  }

  let authToken: Nullable<AuthToken>;

  if (!payload.type && payload.userId) {
    // Session token v0 (legacy)
    // Emulating V1 payload with synthetic sessionId
    // TODO This block should be removed when the V0 sessions become deprecated
    const tokenHash = crypto.createHash('sha256').update(jwtToken).digest();
    payload.id = uuidv4({ random: tokenHash });
    payload.type = SessionTokenV1.TYPE;
    payload.issue = 1;
    authToken = await sessionTokenV1Store.create(payload.userId, ctx, payload.id);
  } else if (payload.type === SessionTokenV1.TYPE) {
    // Session token v1
    authToken = await sessionTokenV1Store.getById(payload.id!);
  } else if (payload.type === AppTokenV1.TYPE) {
    // Application token v1
    authToken = await dbAdapter.getAppTokenById(payload.id!);
  } else {
    authToken = null;
  }

  if (!authToken) {
    authDebugError(`auth token is not found`);
    throw new NotAuthorizedException(`auth token is not found`);
  }

  ctx.state = { ...ctx.state, authToken, authJWTPayload: payload };

  await authToken.middleware(ctx, next);
}
