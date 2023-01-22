import { Context, Next } from 'koa';

import { NotAuthorizedException } from '../../support/exceptions';
import { authDebugError } from '../../models/auth-tokens';
import { verifyJWTSync, type JWTPayload } from '../../support/verifyJWTSync';

export async function withJWT(ctx: Context, next: Next) {
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

  let payload: JWTPayload;

  try {
    payload = verifyJWTSync(jwtToken);
  } catch (e: unknown) {
    authDebugError(`invalid JWT`, { error: e });
    throw new NotAuthorizedException(`invalid auth token: bad JWT`);
  }

  ctx.state = { ...ctx.state, authJWTPayload: payload };

  await next();
}
