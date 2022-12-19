import { Context, Next } from 'koa';

import { dbAdapter } from '../../models';
import { NotAuthorizedException } from '../../support/exceptions';
import { UUID } from '../../support/types';

import { authDebug, authDebugError } from '.';

/**
 * AuthToken
 * The common subset of all token classes
 */
export abstract class AuthToken {
  readonly hasFullAccess: boolean = false;

  constructor(public readonly userId: UUID) {}

  abstract tokenString(): string;

  getUser() {
    return dbAdapter.getUserById(this.userId);
  }

  async middleware(ctx: Context, next: Next) {
    const user = await this.getUser();

    if (!user || !user.isActive) {
      authDebugError(`user ${this.userId} is not exists or is not active`);
      throw new NotAuthorizedException(`user is not exists or is not active`);
    }

    if (await user.isFrozen()) {
      authDebugError(`user ${this.userId} has been suspended by the site administration`);
      throw new NotAuthorizedException(`account has been suspended by the site administration`);
    }

    authDebug(`authenticated as ${user.username} with ${this.constructor.name} token`);

    ctx.state.user = user;

    await next();
  }
}
