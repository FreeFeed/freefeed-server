import _ from 'lodash'
import { dbAdapter } from '../../../models'
import exceptions from '../../../support/exceptions'

export default class UsersController {
  static async blockedByMe(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    try {
      const banIds = await req.user.getBanIds()
      const bannedUsers = await dbAdapter.getUsersByIds(banIds)
      const profilePicsPromises = bannedUsers.map( async (user) => {
          let request = _.pick(user, ['id', 'username', 'screenName'])
          request.profilePictureLargeUrl = await user.getProfilePictureLargeUrl()
          request.profilePictureMediumUrl = await user.getProfilePictureMediumUrl()
          return request
        })
      const result = await Promise.all(profilePicsPromises)
      res.jsonp(result)
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }
}
