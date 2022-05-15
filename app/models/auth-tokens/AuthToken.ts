import { Context, Next } from 'koa';

import { NotAuthorizedException } from '../../support/exceptions';
import { UUID } from '../../support/types';
import { DbAdapter } from '../../support/DbAdapter';
import { database } from '../common';

import { authDebug, authDebugError } from '.';

/**
 * AuthToken
 * The common subset of all token classes
 */
export abstract class AuthToken {
  readonly hasFullAccess: boolean = false;
  readonly [database]: DbAdapter;

  constructor(public readonly userId: UUID, dbAdapter: DbAdapter) {
    this[database] = dbAdapter;
  }

  abstract tokenString(): string;

  getUser() {
    return this[database].getUserById(this.userId);
  }

  async middleware(ctx: Context, next: Next) {
    const user = await this.getUser();

    if (!user || !user.isActive) {
      authDebugError(`user ${this.userId} is not exists or is not active`);
      throw new NotAuthorizedException(`user is not exists or is not active`);
    }

    authDebug(`authenticated as ${user.username} with ${this.constructor.name} token`);

    ctx.state.user = user;

    await next();
  }
}
