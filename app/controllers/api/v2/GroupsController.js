import _ from 'lodash'

import { dbAdapter } from '../../../models'


export default class GroupsController {
  static async managedGroups(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Unauthorized', status: 'fail' };
      return
    }

    const managedGroups = await ctx.state.user.getManagedGroups()

    const promises = managedGroups.map(async (group) => {
      const groupDescr = _.pick(group, ['id', 'username', 'screenName', 'isPrivate', 'isRestricted'])

      const unconfirmedFollowerIds = await group.getSubscriptionRequestIds()
      const unconfirmedFollowers = await dbAdapter.getUsersByIds(unconfirmedFollowerIds)
      const requests = unconfirmedFollowers.map(async (user) => {
        const request = _.pick(user, ['id', 'username', 'screenName'])
        request.profilePictureLargeUrl = await user.getProfilePictureLargeUrl()
        request.profilePictureMediumUrl = await user.getProfilePictureMediumUrl()
        return request
      })

      groupDescr.requests = await Promise.all(requests)
      return groupDescr
    })

    ctx.body = await Promise.all(promises);
  }
}
