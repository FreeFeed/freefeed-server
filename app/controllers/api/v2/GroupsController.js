import _ from 'lodash'

import { dbAdapter } from '../../../models'
import { reportError } from '../../../support/exceptions'


export default class GroupsController {
  static async managedGroups(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Unauthorized', status: 'fail' })
      return
    }

    try {
      const managedGroups = await req.user.getManagedGroups()
      let groupsJson = []

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
      groupsJson = await Promise.all(promises)

      res.jsonp(groupsJson)
    } catch (e) {
      reportError(res)(e)
    }
  }
}
