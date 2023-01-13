import compose from 'koa-compose';

import { type Ctx, type UUID } from '../../../support/types';
import { targetUserRequired } from '../../middlewares';
import { dbAdapter, type User } from '../../../models';
import { ForbiddenException } from '../../../support/exceptions';
import { ROLE_MODERATOR } from '../../../models/admins';

import { serializeUser, serializeUsers } from './serializers';

export async function listUsers(ctx: Ctx) {
  const moderatorIds: UUID[] = await dbAdapter.getUsersWithAdminRoles();
  ctx.body = { users: await serializeUsers(moderatorIds) };
}

export const promoteModerator = (doPromote: boolean) =>
  compose([
    targetUserRequired(),
    async (ctx: Ctx<{ targetUser: User }>) => {
      const { targetUser } = ctx.state;

      if (!targetUser.isUser()) {
        throw new ForbiddenException('Only user can be moderator');
      }

      await dbAdapter.setUserAdminRole(targetUser.id, ROLE_MODERATOR, doPromote);
      ctx.body = { user: await serializeUser(targetUser.id) };
    },
  ]);
