import _ from 'lodash'

import { dbAdapter } from '../../../models'
import exceptions from '../../../support/exceptions'


export default class GroupsController {
  static async managedGroups(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Unauthorized', status: 'fail'})
      return
    }

    try {
      let managedGroups = await req.user.getManagedGroups()
      let groupsJson = []

      let promises = managedGroups.map(async (group)=>{
        let groupDescr = _.pick(group, ['id', 'username', 'screenName', 'isPrivate', 'isRestricted'])

        let unconfirmedFollowerIds = await group.getSubscriptionRequestIds()
        let unconfirmedFollowers = await dbAdapter.getUsersByIds(unconfirmedFollowerIds)
        let requests = unconfirmedFollowers.map( async (user)=>{
          let request = _.pick(user, ['id', 'username', 'screenName'])
          request.profilePictureLargeUrl = await user.getProfilePictureLargeUrl()
          request.profilePictureMediumUrl = await user.getProfilePictureMediumUrl()
          return request
        })

        groupDescr.requests = await Promise.all(requests)
        return groupDescr
      })
      groupsJson = await Promise.all(promises)

      res.jsonp(groupsJson)
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }
}
