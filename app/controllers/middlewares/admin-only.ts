import { type Context, type Next } from 'koa';

import { dbAdapter, type User } from '../../models';
import { ForbiddenException } from '../../support/exceptions';

export async function adminOnly(ctx: Context, next: Next) {
  const { user }: { user: User } = ctx.state;

  const isAdmin = await dbAdapter.userIsAdmin(user.id);

  if (!isAdmin) {
    throw new ForbiddenException();
  }

  await next();
  return;
}

export async function moderatorOnly(ctx: Context, next: Next) {
  const { user }: { user: User } = ctx.state;

  const isModerator = await dbAdapter.userIsModerator(user.id);

  if (!isModerator) {
    throw new ForbiddenException();
  }

  await next();
  return;
}
