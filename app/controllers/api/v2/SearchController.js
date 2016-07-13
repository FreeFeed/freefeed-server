import { dbAdapter } from '../../../models'
import { reportError, NotFoundException, ForbiddenException } from '../../../support/exceptions'
import { SearchQueryParser, SEARCH_TYPES } from '../../../support/SearchQueryParser'

export default class SearchController {
  static async search(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Unauthorized', status: 'fail' })
      return
    }

    try {
      const preparedQuery = SearchQueryParser.parse(req.query.qs)

      let foundPosts = []
        , isSubscribed = false
      if (preparedQuery.type == SEARCH_TYPES.DEFAULT) {
        foundPosts = await dbAdapter.searchPosts(preparedQuery.query, req.user.id, req.user.subscribedFeedIds)
      }
      switch (preparedQuery.type) {
        case SEARCH_TYPES.DEFAULT:
          foundPosts = await dbAdapter.searchPosts(preparedQuery.query, req.user.id, req.user.subscribedFeedIds)
          break

        case SEARCH_TYPES.USER_POSTS:
          let user = await dbAdapter.getUserByUsername(preparedQuery.username)
          if (!user) {
            throw new NotFoundException(`User "${preparedQuery.username}" is not found`)
          }

          const userPostsFeedId = await user.getPostsTimelineId()
          isSubscribed = await dbAdapter.isUserSubscribedToTimeline(req.user.id, userPostsFeedId)
          if (!isSubscribed && user.isPrivate) {
            throw new ForbiddenException(`You are not subscribed to user "${preparedQuery.username}"`)
          }
          
          foundPosts = await dbAdapter.searchUserPosts(preparedQuery.query, user.id, req.user.subscribedFeedIds)

          break

        case SEARCH_TYPES.GROUP_POSTS:
          let group = await dbAdapter.getGroupByUsername(preparedQuery.group)
          if (!group) {
            throw new NotFoundException(`Group "${preparedQuery.group}" is not found`)
          }

          const groupPostsFeedId = await group.getPostsTimelineId()
          isSubscribed = await dbAdapter.isUserSubscribedToTimeline(req.user.id, groupPostsFeedId)
          if (!isSubscribed && group.isPrivate) {
            throw new ForbiddenException(`You are not subscribed to group "${preparedQuery.group}"`)
          }

          foundPosts = await dbAdapter.searchGroupPosts(preparedQuery.query, groupPostsFeedId, req.user.subscribedFeedIds)

          break
      }

      res.jsonp(foundPosts)
    } catch(e) {
      reportError(res)(e)
    }
  }
}
