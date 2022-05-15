import { NotFoundException } from '../../../support/exceptions';

export default class RequestsController {
  static async revokeRequest(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Unauthorized', status: 'fail' };
      return;
    }

    const followedFeedOwnerName = ctx.params.followedUserName;
    const followedFeedOwner = await ctx.modelRegistry.dbAdapter.getFeedOwnerByUsername(
      followedFeedOwnerName,
    );

    if (null === followedFeedOwner) {
      throw new NotFoundException(`Feed owner "${followedFeedOwnerName}" is not found`);
    }

    const subscriptionRequestFound = await ctx.modelRegistry.dbAdapter.isSubscriptionRequestPresent(
      ctx.state.user.id,
      followedFeedOwner.id,
    );

    if (!subscriptionRequestFound) {
      throw new NotFoundException(
        `Subscription request to "${followedFeedOwnerName}" is not found`,
      );
    }

    await followedFeedOwner.rejectSubscriptionRequest(ctx.state.user.id);

    if (followedFeedOwner.type === 'user') {
      await ctx.modelRegistry.eventService.onSubscriptionRequestRevoked(
        ctx.state.user.intId,
        followedFeedOwner.intId,
      );
    } else {
      await ctx.modelRegistry.eventService.onGroupSubscriptionRequestRevoked(
        ctx.state.user.intId,
        followedFeedOwner,
      );
    }

    ctx.body = { err: null, status: 'success' };
  }
}
