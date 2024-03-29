import compose from 'koa-compose';
import { DateTime, Duration } from 'luxon';

import { User, dbAdapter } from '../../../models';
import { Ctx } from '../../../support/types';
import { inputSchemaRequired, targetUserRequired } from '../../middlewares';
import { ForbiddenException, ValidationException } from '../../../support/exceptions';
import {
  ACT_DISABLE_INVITES_FOR_USER,
  ACT_ENABLE_INVITES_FOR_USER,
  ACT_FREEZE_USER,
  ACT_SUSPEND_USER,
  ACT_UNFREEZE_USER,
  ACT_UNSUSPEND_USER,
} from '../../../models/admins';
import { GONE_SUSPENDED } from '../../../models/user';

import { getQueryParams } from './query-params';
import { serializeUser, serializeUsers } from './serializers';
import { freezeUserInputSchema } from './data-schemes/freeze';

export async function listAll(ctx: Ctx) {
  const { limit, offset } = getQueryParams(ctx.request.query);

  const userIds = await dbAdapter.getAllUsersIds(limit + 1, offset, ['user']);
  const isLastPage = userIds.length <= limit;

  if (!isLastPage) {
    userIds.length = limit;
  }

  ctx.body = { users: await serializeUsers(userIds), isLastPage };
}

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

    if (freezeUntil === 'Infinity') {
      // ok
    } else if (freezeUntil.startsWith('P')) {
      // Duration
      if (!Duration.fromISO(freezeUntil).isValid) {
        throw new ValidationException(`Invalid duration string in 'freezeUntil'`);
      }
    } else {
      // Time as ISO time string
      const d = DateTime.fromISO(freezeUntil, { zone: ctx.config.ianaTimeZone });

      if (!d.isValid) {
        throw new ValidationException(`Invalid datetime string in 'freezeUntil'`);
      }

      if (d.diffNow().valueOf() < 60 * 1000) {
        throw new ValidationException(`'freezeUntil' should be in the future`);
      }
    }

    await dbAdapter.doInTransaction(async () => {
      await targetUser.freeze(freezeUntil);
      const until = await targetUser.frozenUntil();
      await dbAdapter.createAdminAction(ACT_FREEZE_USER, user, targetUser, { freezeUntil: until });
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
      await targetUser.freeze('P0D');
      await dbAdapter.createAdminAction(ACT_UNFREEZE_USER, user, targetUser);
    });

    ctx.body = {};
  },
]);

export const userInfo = compose([
  targetUserRequired(),
  async (ctx: Ctx<{ targetUser: User }>) => {
    const { targetUser } = ctx.state;

    ctx.body = {
      user: await serializeUser(targetUser.id),
    };
  },
]);

export const suspendUser = (doSuspend: boolean) =>
  compose([
    targetUserRequired(),
    async (ctx: Ctx<{ user: User; targetUser: User }>) => {
      const { user, targetUser } = ctx.state;

      if (!targetUser.isUser()) {
        throw new ForbiddenException('Only user can be suspended');
      }

      if (doSuspend && targetUser.goneStatus !== null) {
        throw new ValidationException(`User already in ${targetUser.goneStatusName} status`);
      }

      if (!doSuspend && targetUser.goneStatus !== GONE_SUSPENDED) {
        throw new ValidationException(
          `User is not in SUSPENDED status (actual status is ${targetUser.goneStatusName})`,
        );
      }

      await dbAdapter.doInTransaction(async () => {
        await targetUser.setGoneStatus(doSuspend ? GONE_SUSPENDED : null);
        await dbAdapter.createAdminAction(
          doSuspend ? ACT_SUSPEND_USER : ACT_UNSUSPEND_USER,
          user,
          targetUser,
        );
      });

      ctx.body = {};
    },
  ]);

export const disableInvitesForUser = (doDisable: boolean) =>
  compose([
    targetUserRequired(),
    async (ctx: Ctx<{ user: User; targetUser: User }>) => {
      const { user, targetUser } = ctx.state;

      if (!targetUser.isUser()) {
        throw new ForbiddenException('Only user can issue invites');
      }

      const isDisabled = await targetUser.isInvitesDisabled();

      if (isDisabled === doDisable) {
        throw new ValidationException(
          `User already has invitations ${doDisable ? 'disabled' : 'enabled'}`,
        );
      }

      await dbAdapter.doInTransaction(async () => {
        await targetUser.setInvitesDisabled(doDisable);
        await dbAdapter.createAdminAction(
          doDisable ? ACT_DISABLE_INVITES_FOR_USER : ACT_ENABLE_INVITES_FOR_USER,
          user,
          targetUser,
        );
      });

      ctx.body = {};
    },
  ]);
