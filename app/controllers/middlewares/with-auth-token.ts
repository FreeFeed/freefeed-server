import { Context, Next } from 'koa';

import { NotAuthorizedException } from '../../support/exceptions';
import { authDebugError, AuthToken, SessionTokenV1 } from '../../models/auth-tokens';
import { AppTokenV1, dbAdapter, sessionTokenV1Store } from '../../models';
import { Nullable } from '../../support/types';

export async function withAuthToken(ctx: Context, next: Next) {
  const payload = ctx.state.authJWTPayload;

  if (!payload) {
    // Not authenticated
    await next();
    return;
  }

  let authToken: Nullable<AuthToken>;

  if (payload.type === SessionTokenV1.TYPE) {
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

  ctx.state = { ...ctx.state, authToken };

  await authToken.middleware(ctx, next);
}
