import _ from 'lodash';

import { dbAdapter } from '../../../models';
import { userSerializerFunction } from '../../../serializers/v2/user';

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
}
