import compose from 'koa-compose';

import { User } from '../../../models';
import { Ctx } from '../../../support/types';
import { adminRolesRequired } from '../../middlewares/admin-only';

import { serializeUser } from './serializers';

export const whoAmI = compose([
  adminRolesRequired(),
  async (ctx: Ctx<{ user: User }>) => {
    const { user } = ctx.state;
    ctx.body = { user: await serializeUser(user.id) };
  },
]);
