import { dbAdapter } from '../../../models';
import type { User } from '../../../models';
import type { Ctx } from '../../../support/types';

import { getQueryParams } from './query-params';
import { serializeUser } from './serializers';

export async function whoAmI(ctx: Ctx<{ user: User }>) {
  const { user } = ctx.state;
  ctx.body = { user: await serializeUser(user.id) };
}

export async function journal(ctx: Ctx) {
  const { limit, offset } = getQueryParams(ctx.request.query);
  const actions = await dbAdapter.getAdminActions(limit + 1, offset);
  const isLastPage = actions.length <= limit;

  if (!isLastPage) {
    actions.length = limit;
  }

  ctx.body = { actions, isLastPage };
}
