import _ from 'lodash';
import { dbAdapter } from '../../../models';
import { NotFoundException, ValidationException } from '../../../support/exceptions';
import { userSerializerFunction } from '../../../serializers/v2/user';


export default class InvitationsController {
  static async getInvitation(ctx) {
    const invitation = await dbAdapter.getInvitation(ctx.params.secureId);
    if (!invitation) {
      throw new NotFoundException(`Can't find invitation '${ctx.params.secureId}'`);
    }

    const invitationUsers = await serializeInvitationUsers(
      invitation.recommendations.users,
      invitation.recommendations.groups,
      invitation.author
    );

    ctx.body = {
      invitation,
      ...invitationUsers
    };
  }

  static async createInvitation(ctx) {
    if (!ctx.state.user) {
      ctx.status = 403;
      ctx.body = { err: 'Unauthorized' };
      return;
    }

    await validateInvitation(ctx.request);

    const [invitationId] = await dbAdapter.createInvitation(
      ctx.state.user.intId,
      ctx.request.body.message,
      ctx.request.body.lang,
      ctx.request.body.singleUse,
      ctx.request.body.users,
      ctx.request.body.groups
    );

    ctx.params.secureId = invitationId;
    await InvitationsController.getInvitation(ctx);
  }
}

async function serializeInvitationUsers(userNames, groupNames, authorIntId) {
  userNames = userNames || [];
  groupNames = groupNames || [];

  const [{ uid: authorUUID }] = await dbAdapter.getUsersIdsByIntIds([authorIntId]);
  const recommendedUsersAndGroups = await dbAdapter.getFeedOwnersByUsernames(userNames.concat(groupNames));
  const userIds = recommendedUsersAndGroups.map((u) => u.id);
  userIds.push(authorUUID);

  const [allUsersAssoc, allStatsAssoc] = await Promise.all([
    dbAdapter.getUsersByIdsAssoc(userIds),
    dbAdapter.getUsersStatsAssoc(userIds),
  ]);

  const serializeUser = userSerializerFunction(allUsersAssoc, allStatsAssoc);
  const users = Object.keys(allUsersAssoc).map(serializeUser).filter((u) => u.type === 'user');
  const groups = Object.keys(allUsersAssoc).map(serializeUser).filter((u) => u.type === 'group');

  return {
    users,
    groups
  };
}

async function validateInvitation(request) {
  const users = await dbAdapter.getFeedOwnersByUsernames(request.body.users || []);
  const groups = await dbAdapter.getFeedOwnersByUsernames(request.body.groups || []);

  const wrongUsers = _.difference(request.body.users, users.filter((u) => u.type === 'user').map((u) => u.username));
  if (wrongUsers.length) {
    throw new ValidationException(`Users not found: ${wrongUsers}`);
  }

  const wrongGroups = _.difference(request.body.groups, groups.filter((u) => u.type === 'group').map((u) => u.username));
  if (wrongGroups.length) {
    throw new ValidationException(`Groups not found: ${wrongGroups}`);
  }

  if (!request.body.message || !request.body.message.length) {
    throw new ValidationException('Invitation message must not be empty');
  }

  if (!request.body.lang || !request.body.lang.length) {
    throw new ValidationException('Invitation lang must not be empty');
  }

  if (!request.body.hasOwnProperty('singleUse') || !_.isBoolean(request.body.singleUse)) {
    throw new ValidationException('Invitation singleUse must not be empty');
  }
}
