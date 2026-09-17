import type { Context, Next } from 'koa';

import { NotAuthorizedException } from '../../support/exceptions';
import { authDebugError } from '../../models/auth-tokens';
import { verifyJWTAsync } from '../../support/verifyJWTAsync';
import type { JWTPayload } from '../../support/verifyJWTAsync';

export async function withJWT(ctx: Context, next: Next) {
  let jwtToken: string | undefined;

  if (ctx.headers['authorization']) {
    // The Bearer authorization scheme
    if (!ctx.headers['authorization'].startsWith('Bearer ')) {
      throw new NotAuthorizedException(`invalid Authorization header, use 'Bearer' scheme`);
    }

    jwtToken = ctx.headers['authorization'].replace(/^Bearer\s+/, '');
  } else {
    // The legacy X-Authentication-Token header
    const body = ctx.request.body as { authToken?: string } | undefined;
    const queryToken = ctx.query.authToken;
    jwtToken =
      (ctx.headers['x-authentication-token'] as string | undefined) ||
      body?.authToken ||
      (Array.isArray(queryToken) ? queryToken[0] : queryToken);
  }

  if (!jwtToken) {
    // Not authenticated
    await next();
    return;
  }

  let payload: JWTPayload;

  try {
    payload = await verifyJWTAsync(jwtToken);
  } catch (e: unknown) {
    authDebugError(`invalid JWT`, { error: e });
    throw new NotAuthorizedException(`invalid auth token: bad JWT`);
  }

  ctx.state = { ...ctx.state, authJWTPayload: payload };

  await next();
}
