import _ from 'lodash'

import { dbAdapter } from '../../../models'
import exceptions from '../../../support/exceptions'


export default class GroupsController {
  static async groupRequests(req, res) {
    if (!req.user)
      return res.status(401).jsonp({ err: 'Unauthorized', status: 'fail'})

    try {
      let managedGroups = await req.user.getManagedGroups()

      let groupsJson = []

      if (_.isArray(managedGroups) && managedGroups.length > 0){
        let promises = managedGroups.map(async (group)=>{
          let groupDescr = _.pick(group, ['id', 'username', 'screenName', 'isPrivate', 'isRestricted'])

          let unconfirmedFollowerIds = await group.getSubscriptionRequestIds()
          let unconfirmedFollowers = await dbAdapter.getUsersByIds(unconfirmedFollowerIds)
          groupDescr.requests = _.map(unconfirmedFollowers, (user)=>{ return _.pick(user, ['id', 'username', 'screenName']) })
          groupsJson.push(groupDescr)
        })
        await Promise.all(promises)
      }

      res.jsonp(groupsJson)
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }
}
