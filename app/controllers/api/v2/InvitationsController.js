import _ from 'lodash';
import compose from 'koa-compose';

import { dbAdapter } from '../../../models';
import {
  ForbiddenException,
  TooManyRequestsException,
  NotFoundException,
  ValidationException,
} from '../../../support/exceptions';
import { serializeUsersByIds } from '../../../serializers/v2/user';
import { authRequired, monitored } from '../../middlewares';
import { TOO_OFTEN, TOO_SOON } from '../../../models/invitations';

/**
 * @typedef {import('../../../support/types').Ctx} Ctx
 */

export default class InvitationsController {
  static async getInvitation(ctx) {
    const invitation = await dbAdapter.getInvitation(ctx.params.secureId);

    if (!invitation) {
      throw new NotFoundException(`Can't find invitation '${ctx.params.secureId}'`);
    }

    const invAuthor = await dbAdapter.getUserByIntId(invitation.author);

    if (!invAuthor.isActive || (await invAuthor.isInvitesDisabled())) {
      throw new NotFoundException(`Can't find invitation '${ctx.params.secureId}'`);
    }

    const invitationUsers = await serializeInvitationUsers(
      invitation.recommendations.users,
      invitation.recommendations.groups,
      invitation.author,
    );

    invitation.author = invitationUsers.authorUUID;

    ctx.body = {
      invitation,
      users: invitationUsers.users,
      groups: invitationUsers.groups,
    };
  }

  static invitationsInfo = compose([
    authRequired(),
    /** @param {Ctx} ctx */
    async (ctx) => {
      const {
        state: { user },
        config,
      } = ctx;

      const reason = await dbAdapter.canUserCreateInvitation(
        user.id,
        config.invitations.canCreateIf,
      );

      ctx.body = {
        canCreateNew: reason === null,
        singleUseOnly: config.invitations.requiredForSignUp,
        reasonNotCreate: reason ? { code: reason, message: '' } : null,
      };

      if (reason !== null) {
        switch (reason) {
          case TOO_OFTEN:
            ctx.body.reasonNotCreate.message =
              'You create invitations too often. Please try again later.';
            break;
          case TOO_SOON:
            ctx.body.reasonNotCreate.message =
              'You cannot create invitations because your account was created recently or is not active enough.';
            break;
          default:
            ctx.body.reasonNotCreate.message =
              'The ability to create invitations is disabled for you.';
        }
      }
    },
  ]);

  static createInvitation = compose([
    authRequired(),
    monitored('invitation.create'),
    /** @param {Ctx} ctx */
    async (ctx) => {
      const { user } = ctx.state;

      await InvitationsController.invitationsInfo(ctx);

      if (!ctx.body.canCreateNew) {
        const { code, message } = ctx.body.reasonNotCreate;

        if (code === TOO_OFTEN) {
          throw new TooManyRequestsException(message);
        } else {
          throw new ForbiddenException(message);
        }
      }

      await validateInvitation(ctx.request.body);

      if (ctx.body.singleUseOnly && !ctx.request.body.singleUse) {
        throw new ValidationException('Only single-use invitations are allowed.');
      }

      ctx.params.secureId = await user.createInvitation(ctx.request.body);
      await InvitationsController.getInvitation(ctx);
    },
  ]);
}

async function serializeInvitationUsers(userNames, groupNames, authorIntId) {
  userNames = userNames || [];
  groupNames = groupNames || [];

  const [{ uid: authorUUID }] = await dbAdapter.getUsersIdsByIntIds([authorIntId]);
  const recommendedUsersAndGroups = await dbAdapter.getFeedOwnersByUsernames(
    userNames.concat(groupNames),
  );
  const userIds = recommendedUsersAndGroups.map((u) => u.id);
  userIds.push(authorUUID);

  const sUsers = await serializeUsersByIds(userIds);
  return {
    users: sUsers.filter((u) => u.type === 'user'),
    groups: sUsers.filter((u) => u.type === 'group'),
    authorUUID,
  };
}

async function validateInvitation(data) {
  const users = await dbAdapter.getFeedOwnersByUsernames(data.users || []);
  const groups = await dbAdapter.getFeedOwnersByUsernames(data.groups || []);

  const wrongUsers = _.difference(
    data.users,
    users.filter((u) => u.type === 'user').map((u) => u.username),
  );

  if (wrongUsers.length) {
    throw new ValidationException(`Users not found: ${wrongUsers}`);
  }

  const wrongGroups = _.difference(
    data.groups,
    groups.filter((u) => u.type === 'group').map((u) => u.username),
  );

  if (wrongGroups.length) {
    throw new ValidationException(`Groups not found: ${wrongGroups}`);
  }

  if (!data.message || !data.message.length) {
    throw new ValidationException('Invitation message must not be empty');
  }

  if (!data.lang || !data.lang.length) {
    throw new ValidationException('Invitation lang must not be empty');
  }

  if (!data.hasOwnProperty('singleUse') || !_.isBoolean(data.singleUse)) {
    throw new ValidationException('Invitation singleUse must not be empty');
  }
}
