import { dbAdapter } from '../../../models'
import { reportError, NotFoundException, ForbiddenException } from '../../../support/exceptions'
import { SearchQueryParser } from '../../../support/SearchQueryParser'
import { SEARCH_SCOPES } from '../../../support/SearchConstants'
import { serializePostsCollection } from '../../../serializers/v2/post';

export default class SearchController {
  app = null;

  constructor(app) {
    this.app = app;
  }

  search = async (req, res) => {
    try {
      const preparedQuery = SearchQueryParser.parse(req.query.qs, req.user ? req.user.username : null)
      const DEFAULT_LIMIT = 30

      let foundPosts = []
        , isSubscribed = false
        , targetUser
        , targetGroup
        , offset
        , limit

      offset = parseInt(req.query.offset, 10) || 0
      limit =  parseInt(req.query.limit, 10) || DEFAULT_LIMIT
      if (offset < 0)
        offset = 0
      if (limit < 0)
        limit = DEFAULT_LIMIT

      const bannedUserIds = req.user ? await req.user.getBanIds() : [];
      const currentUserId = req.user ? req.user.id : null;
      const isAnonymous = !req.user;
      const visibleFeedIds = req.user ? req.user.subscribedFeedIds : [];

      switch (preparedQuery.scope) {
        case SEARCH_SCOPES.ALL_VISIBLE_POSTS:
          {
            foundPosts = await dbAdapter.searchPosts(preparedQuery, currentUserId, visibleFeedIds, bannedUserIds, offset, limit)
            break
          }

        case SEARCH_SCOPES.VISIBLE_USER_POSTS:
          {
            if (preparedQuery.username === 'me') {
              throw new NotFoundException(`Please sign in to use 'from:me' operator`)
            }

            targetUser = await dbAdapter.getUserByUsername(preparedQuery.username)
            if (!targetUser) {
              throw new NotFoundException(`User "${preparedQuery.username}" is not found`)
            }

            if (isAnonymous && targetUser.isProtected === '1') {
              throw new ForbiddenException(`Please sign in to view user "${preparedQuery.username}"`)
            }

            if (targetUser.id != currentUserId) {
              const userPostsFeedId = await targetUser.getPostsTimelineId()
              isSubscribed          = await dbAdapter.isUserSubscribedToTimeline(currentUserId, userPostsFeedId)
              if (!isSubscribed && targetUser.isPrivate == '1') {
                throw new ForbiddenException(`You are not subscribed to user "${preparedQuery.username}"`)
              }
            }

            foundPosts = await dbAdapter.searchUserPosts(preparedQuery, targetUser.id, visibleFeedIds, bannedUserIds, offset, limit)

            break
          }
        case SEARCH_SCOPES.VISIBLE_GROUP_POSTS:
          {
            targetGroup = await dbAdapter.getGroupByUsername(preparedQuery.group)
            if (!targetGroup) {
              throw new NotFoundException(`Group "${preparedQuery.group}" is not found`)
            }

            const groupPostsFeedId = await targetGroup.getPostsTimelineId()
            isSubscribed           = await dbAdapter.isUserSubscribedToTimeline(currentUserId, groupPostsFeedId)
            if (!isSubscribed && targetGroup.isPrivate == '1') {
              throw new ForbiddenException(`You are not subscribed to group "${preparedQuery.group}"`)
            }

            foundPosts = await dbAdapter.searchGroupPosts(preparedQuery, groupPostsFeedId, visibleFeedIds, bannedUserIds, offset, limit)

            break
          }
      }

      const postsObjects = dbAdapter.initRawPosts(foundPosts, { currentUser: currentUserId })

      const postsCollectionJson = await serializePostsCollection(postsObjects)

      res.jsonp(postsCollectionJson)
    } catch (e) {
      if ('internalQuery' in e) {
        // looks like postgres err
        this.app.logger.error(e);
        Reflect.deleteProperty(e, 'message');  // do not expose DB internals
      }

      reportError(res)(e)
    }
  };
}
