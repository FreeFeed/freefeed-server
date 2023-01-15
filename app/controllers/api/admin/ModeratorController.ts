import compose from 'koa-compose';
import { DateTime } from 'luxon';

import { User, dbAdapter } from '../../../models';
import { Ctx } from '../../../support/types';
import { inputSchemaRequired, targetUserRequired } from '../../middlewares';
import { ForbiddenException, ValidationException } from '../../../support/exceptions';
import { ACT_FREEZE_USER, ACT_UNFREEZE_USER } from '../../../models/admins';

import { getQueryParams } from './query-params';
import { serializeUsers } from './serializers';
import { freezeUserInputSchema } from './data-schemes/freeze';

export async function listFrozen(ctx: Ctx) {
  const { limit, offset } = getQueryParams(ctx.request.query);

  const frozen = await dbAdapter.getFrozenUsers(limit + 1, offset);
  const isLastPage = frozen.length <= limit;

  if (!isLastPage) {
    frozen.length = limit;
  }

  ctx.body = {
    frozen,
    users: await serializeUsers(frozen.map((r) => r.userId)),
    isLastPage,
  };
}

export const freezeUser = compose([
  targetUserRequired(),
  inputSchemaRequired(freezeUserInputSchema),
  async (ctx: Ctx<{ user: User; targetUser: User }>) => {
    const { user, targetUser } = ctx.state;

    if (!targetUser.isUser()) {
      throw new ForbiddenException('Only user can be frozen');
    }

    const { freezeUntil } = ctx.request.body as { freezeUntil: string };
    const freezeTime = DateTime.fromISO(freezeUntil, { zone: ctx.config.ianaTimeZone });

    if (!freezeTime.isValid) {
      throw new ValidationException(`Invalid ISO datetime in 'freezeUntil'`);
    }

    if (freezeTime.diffNow().valueOf() < 0) {
      throw new ValidationException(`'freezeUntil' should be in the future`);
    }

    await dbAdapter.doInTransaction(async () => {
      await targetUser.freeze(freezeTime.toISO());
      await dbAdapter.createAdminAction(ACT_FREEZE_USER, user, targetUser, {
        freezeUntil: freezeTime.toISO(),
      });
    });

    ctx.body = {};
  },
]);

export const unfreezeUser = compose([
  targetUserRequired(),
  async (ctx: Ctx<{ user: User; targetUser: User }>) => {
    const { user, targetUser } = ctx.state;

    if (!targetUser.isUser()) {
      throw new ForbiddenException('Only user can be frozen');
    }

    await dbAdapter.doInTransaction(async () => {
      await targetUser.freeze(0);
      await dbAdapter.createAdminAction(ACT_UNFREEZE_USER, user, targetUser);
    });

    ctx.body = {};
  },
]);
