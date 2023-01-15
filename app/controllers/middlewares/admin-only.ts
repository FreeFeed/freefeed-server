import { type Context, type Next } from 'koa';
import { intersection } from 'lodash';

import { dbAdapter, type User } from '../../models';
import { ForbiddenException } from '../../support/exceptions';
import { AdminRole } from '../../models/admins';

export function adminRolesRequired(...roles: AdminRole[]) {
  return async (ctx: Context, next: Next) => {
    const { user }: { user: User } = ctx.state;
    const userRoles = await dbAdapter.getUserAdminRoles(user.id);

    if (roles.length === 0) {
      // When roles.length === 0 we need ANY admin role
      if (userRoles.length === 0) {
        throw new ForbiddenException();
      }
    } else if (intersection(roles, userRoles).length === 0) {
      throw new ForbiddenException();
    }

    await next();
  };
}
