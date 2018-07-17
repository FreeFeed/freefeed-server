import _ from 'lodash';
import { dbAdapter } from '../../../models';
import { NotFoundException, ValidationException } from '../../../support/exceptions';
import { userSerializerFunction } from '../../../serializers/v2/user';


export default class InvitationsController {
  static async getInvitation(ctx) {
    const invitation = await dbAdapter.getInvitation(ctx.params.secureId);
    if (null === invitation) {
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

    const users = await dbAdapter.getFeedOwnersByUsernames(ctx.request.body.users || []);
    const groups = await dbAdapter.getFeedOwnersByUsernames(ctx.request.body.groups || []);

    const wrongUsers = _.difference(ctx.request.body.users, users.filter((u) => u.type === 'user').map((u) => u.username));
    if (wrongUsers.length) {
      throw new ValidationException(`Users not found: ${wrongUsers}`);
    }

    const wrongGroups = _.difference(ctx.request.body.groups, groups.filter((u) => u.type === 'group').map((u) => u.username));
    if (wrongGroups.length) {
      throw new ValidationException(`Groups not found: ${wrongGroups}`);
    }

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
