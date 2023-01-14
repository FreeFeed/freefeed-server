import compose from 'koa-compose';

import { type Ctx, type UUID } from '../../../support/types';
import { targetUserRequired } from '../../middlewares';
import { dbAdapter, type User } from '../../../models';
import { ForbiddenException } from '../../../support/exceptions';
import {
  ACT_GIVE_MODERATOR_RIGHTS,
  ACT_REMOVE_MODERATOR_RIGHTS,
  ROLE_MODERATOR,
} from '../../../models/admins';

import { serializeUser, serializeUsers } from './serializers';

export async function listUsers(ctx: Ctx) {
  const moderatorIds: UUID[] = await dbAdapter.getUsersWithAdminRoles();
  ctx.body = { users: await serializeUsers(moderatorIds) };
}

export const promoteModerator = (doPromote: boolean) =>
  compose([
    targetUserRequired(),
    async (ctx: Ctx<{ user: User; targetUser: User }>) => {
      const { user, targetUser } = ctx.state;

      if (!targetUser.isUser()) {
        throw new ForbiddenException('Only user can be moderator');
      }

      const ok = await dbAdapter.setUserAdminRole(targetUser.id, ROLE_MODERATOR, doPromote);

      if (ok) {
        await dbAdapter.createAdminAction(
          doPromote ? ACT_GIVE_MODERATOR_RIGHTS : ACT_REMOVE_MODERATOR_RIGHTS,
          user.username,
          targetUser.username,
          {},
        );
      }

      ctx.body = { user: await serializeUser(targetUser.id) };
    },
  ]);
