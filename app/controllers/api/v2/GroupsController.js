import compose from 'koa-compose';
import _ from 'lodash';

import { dbAdapter } from '../../../models';
import { serializeUsersByIds, userSerializerFunction } from '../../../serializers/v2/user';
import { ForbiddenException } from '../../../support/exceptions';
import { authRequired, targetUserRequired } from '../../middlewares';

export default class GroupsController {
  static async managedGroups(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Unauthorized', status: 'fail' };
      return;
    }

    const managedGroups = await ctx.state.user.getManagedGroups();

    const promises = managedGroups.map(async (group) => {
      const groupDescr = _.pick(group, [
        'id',
        'username',
        'screenName',
        'isPrivate',
        'isRestricted',
      ]);

      const unconfirmedFollowerIds = await group.getSubscriptionRequestIds();
      const unconfirmedFollowers = await dbAdapter.getUsersByIds(unconfirmedFollowerIds);
      const requests = unconfirmedFollowers.map(async (user) => {
        const request = _.pick(user, ['id', 'username', 'screenName']);
        request.profilePictureLargeUrl = await user.getProfilePictureLargeUrl();
        request.profilePictureMediumUrl = await user.getProfilePictureMediumUrl();
        return request;
      });

      groupDescr.requests = await Promise.all(requests);
      return groupDescr;
    });

    ctx.body = await Promise.all(promises);
  }

  static async allGroups(ctx) {
    const { user: viewer } = ctx.state;
    const withProtected = !!viewer;
    const groups = await dbAdapter.getAllGroups({ withProtected });
    ctx.body = { groups };

    const allUserIds = new Set(groups.map((it) => it.id));

    const allGroupAdmins = await dbAdapter.getGroupsAdministratorsIds(
      [...allUserIds],
      viewer && viewer.id,
    );
    Object.values(allGroupAdmins).forEach((ids) => ids.forEach((s) => allUserIds.add(s)));

    const [allUsersAssoc, allStatsAssoc] = await Promise.all([
      dbAdapter.getUsersByIdsAssoc([...allUserIds]),
      dbAdapter.getUsersStatsAssoc([...allUserIds]),
    ]);
    const serializeUser = userSerializerFunction(allUsersAssoc, allStatsAssoc, allGroupAdmins);

    const users = Object.keys(allUsersAssoc).map(serializeUser);

    ctx.body = { withProtected, groups, users };
  }

  static getBlockedUsers = compose([
    authRequired(),
    targetUserRequired({ groupName: 'group' }),
    async (ctx) => {
      const { user, group } = ctx.state;
      const adminIds = await group.getAdministratorIds();

      if (!adminIds.includes(user.id)) {
        throw new ForbiddenException("You aren't an administrator of this group");
      }

      const blockedUsers = await dbAdapter.userIdsBlockedInGroup(group.id);
      const users = await serializeUsersByIds(blockedUsers, user.id);
      ctx.body = { blockedUsers, users };
    },
  ]);

  static blockUser = compose([
    authRequired(),
    targetUserRequired({ groupName: 'group', userName: 'targetUser' }),
    async (ctx) => {
      const { user, group, targetUser } = ctx.state;

      if (targetUser.isGroup()) {
        throw new ForbiddenException('You cannot block group account');
      }

      const adminIds = await group.getAdministratorIds();

      if (!adminIds.includes(user.id)) {
        throw new ForbiddenException("You aren't an administrator of this group");
      }

      if (adminIds.includes(targetUser.id)) {
        throw new ForbiddenException('You cannot block group administrator');
      }

      const ok = await group.blockUser(targetUser.id, user.id);

      if (!ok) {
        throw new ForbiddenException('This user is already blocked');
      }

      const blockedUsers = await dbAdapter.userIdsBlockedInGroup(group.id);
      const users = await serializeUsersByIds(blockedUsers, user.id);
      ctx.body = { blockedUsers, users };
    },
  ]);

  static unblockUser = compose([
    authRequired(),
    targetUserRequired({ groupName: 'group', userName: 'targetUser' }),
    async (ctx) => {
      const { user, group, targetUser } = ctx.state;
      const adminIds = await group.getAdministratorIds();

      if (!adminIds.includes(user.id)) {
        throw new ForbiddenException("You aren't an administrator of this group");
      }

      const ok = await group.unblockUser(targetUser.id, user.id);

      if (!ok) {
        throw new ForbiddenException("This user isn't blocked");
      }

      const blockedUsers = await dbAdapter.userIdsBlockedInGroup(group.id);
      const users = await serializeUsersByIds(blockedUsers, user.id);
      ctx.body = { blockedUsers, users };
    },
  ]);
}
