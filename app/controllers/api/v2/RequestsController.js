import { dbAdapter } from '../../../models'
import exceptions, { NotFoundException } from '../../../support/exceptions'

export default class RequestsController {
  static async revokeRequest(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Unauthorized', status: 'fail'})
      return
    }

    const followedFeedOwnerName = req.params.followedUserName
    try {
      const followedFeedOwner = await dbAdapter.getFeedOwnerByUsername(followedFeedOwnerName)

      if (null === followedFeedOwner) {
        throw new NotFoundException(`Feed owner "${followedFeedOwnerName}" is not found`)
      }

      const subscriptionRequestFound = await dbAdapter.isSubscriptionRequestPresent(req.user.id, followedFeedOwner.id)
      if (!subscriptionRequestFound){
        throw new NotFoundException(`Subscription request to "${followedFeedOwnerName}" is not found`)
      }

      await followedFeedOwner.rejectSubscriptionRequest(req.user.id)
      res.jsonp({ err: null, status: 'success' })
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }
}
