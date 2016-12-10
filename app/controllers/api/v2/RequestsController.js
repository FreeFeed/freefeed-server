import { dbAdapter } from '../../../models'
import { NotFoundException } from '../../../support/exceptions'

export default class RequestsController {
  static async revokeRequest(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Unauthorized', status: 'fail' };
      return
    }

    const followedFeedOwnerName = ctx.params.followedUserName
    const followedFeedOwner = await dbAdapter.getFeedOwnerByUsername(followedFeedOwnerName)

    if (null === followedFeedOwner) {
      throw new NotFoundException(`Feed owner "${followedFeedOwnerName}" is not found`)
    }

    const subscriptionRequestFound = await dbAdapter.isSubscriptionRequestPresent(ctx.state.user.id, followedFeedOwner.id)
    if (!subscriptionRequestFound) {
      throw new NotFoundException(`Subscription request to "${followedFeedOwnerName}" is not found`)
    }

    await followedFeedOwner.rejectSubscriptionRequest(ctx.state.user.id)
    ctx.body = { err: null, status: 'success' };
  }
}
