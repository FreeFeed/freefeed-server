/* eslint babel/semi: "error" */
import { dbAdapter } from '../../../models';
import { NotFoundException, ForbiddenException } from '../../../support/exceptions';
import { SearchQueryParser } from '../../../support/SearchQueryParser';
import { serializeFeed } from '../../../serializers/v2/post';


export default class SearchController {
  app = null;

  constructor(app) {
    this.app = app;
  }

  search = async (ctx) => {
    const preparedQuery = SearchQueryParser.parse(ctx.request.query.qs, ctx.state.user ? ctx.state.user.username : null);
    const DEFAULT_LIMIT = 30;

    let foundPostsIds = [],
      isSubscribed = false,
      targetUser = null,
      targetGroup,
      offset,
      limit;

    offset = parseInt(ctx.request.query.offset, 10) || 0;
    limit =  parseInt(ctx.request.query.limit, 10) || DEFAULT_LIMIT;

    if (offset < 0) {
      offset = 0;
    }

    if (limit < 0) {
      limit = DEFAULT_LIMIT;
    }

    const requestedLimit = limit;
    limit++;

    const bannedUserIds = ctx.state.user ? await ctx.state.user.getBanIds() : [];
    const feedIntIdsBannedForUser = ctx.state.user ? await dbAdapter.getFeedsIntIdsOfUsersWhoBannedViewer(ctx.state.user.id) : [];
    const currentUserId = ctx.state.user ? ctx.state.user.id : null;
    const isAnonymous = !ctx.state.user;
    const visibleFeedIds = ctx.state.user ? [await ctx.state.user.getPostsTimelineIntId(), ...ctx.state.user.subscribedFeedIds] : [];

    if (ctx.request.query.qs.trim().length === 0) {
      // block "empty" queries for now, as they're too slow
      foundPostsIds = [];
    } else if (preparedQuery.group) {
      targetGroup = await dbAdapter.getGroupByUsername(preparedQuery.group);

      if (!targetGroup) {
        throw new NotFoundException(`Group "${preparedQuery.group}" is not found`);
      }

      if (!currentUserId && targetGroup.isProtected === '1') {
        throw new ForbiddenException(`Please sign in to see content from group "${preparedQuery.group}"`);
      }

      const groupPostsFeedId = await targetGroup.getPostsTimelineId();
      isSubscribed           = currentUserId && await dbAdapter.isUserSubscribedToTimeline(currentUserId, groupPostsFeedId);

      if (!isSubscribed && targetGroup.isPrivate == '1') {
        throw new ForbiddenException(`You are not subscribed to group "${preparedQuery.group}"`);
      }

      let targetUserId = null;

      if (preparedQuery.username) {
        if (preparedQuery.username === 'me') {
          throw new NotFoundException(`Please sign in to use 'from:me' operator`);
        }

        targetUser = await dbAdapter.getUserByUsername(preparedQuery.username);

        if (!targetUser) {
          throw new NotFoundException(`User "${preparedQuery.username}" is not found`);
        }

        targetUserId = targetUser.id;
      }

      foundPostsIds = await dbAdapter.searchGroupPosts(preparedQuery, groupPostsFeedId, targetUserId, visibleFeedIds, bannedUserIds, feedIntIdsBannedForUser, offset, limit);
    } else if (preparedQuery.username) {
      if (preparedQuery.username === 'me') {
        throw new NotFoundException(`Please sign in to use 'from:me' operator`);
      }

      targetUser = await dbAdapter.getUserByUsername(preparedQuery.username);

      if (!targetUser) {
        throw new NotFoundException(`User "${preparedQuery.username}" is not found`);
      }

      if (isAnonymous && targetUser.isProtected === '1') {
        throw new ForbiddenException(`Please sign in to view user "${preparedQuery.username}"`);
      }

      if (targetUser.id != currentUserId) {
        const userPostsFeedId = await targetUser.getPostsTimelineId();
        isSubscribed          = await dbAdapter.isUserSubscribedToTimeline(currentUserId, userPostsFeedId);

        if (!isSubscribed && targetUser.isPrivate == '1') {
          throw new ForbiddenException(`You are not subscribed to user "${preparedQuery.username}"`);
        }
      }

      foundPostsIds = await dbAdapter.searchUserPosts(preparedQuery, targetUser.id, visibleFeedIds, bannedUserIds, feedIntIdsBannedForUser, offset, limit);
    } else {
      foundPostsIds = await dbAdapter.searchPosts(preparedQuery, currentUserId, visibleFeedIds, bannedUserIds, feedIntIdsBannedForUser, offset, limit);
    }

    const isLastPage = foundPostsIds.length <= requestedLimit;

    if (!isLastPage) {
      foundPostsIds.length = requestedLimit;
    }

    ctx.body = await serializeFeed(foundPostsIds, currentUserId, null, { isLastPage });
  };
}
