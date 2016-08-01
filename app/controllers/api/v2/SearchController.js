import _ from 'lodash'
import { dbAdapter, PostSerializer } from '../../../models'
import { reportError, NotFoundException, ForbiddenException } from '../../../support/exceptions'
import { SearchQueryParser } from '../../../support/SearchQueryParser'
import { SEARCH_SCOPES } from '../../../support/SearchConstants'

export default class SearchController {
  static async search(req, res) {
    try {
      const preparedQuery = SearchQueryParser.parse(req.query.qs)
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
      const visibleFeedIds = req.user ? req.user.subscribedFeedIds : [];

      switch (preparedQuery.scope) {
        case SEARCH_SCOPES.ALL_VISIBLE_POSTS:
          {
            foundPosts = await dbAdapter.searchPosts(preparedQuery, currentUserId, visibleFeedIds, bannedUserIds, offset, limit)
            break
          }

        case SEARCH_SCOPES.VISIBLE_USER_POSTS:
          {
            targetUser = await dbAdapter.getUserByUsername(preparedQuery.username)
            if (!targetUser) {
              throw new NotFoundException(`User "${preparedQuery.username}" is not found`)
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

      const postsObjects = dbAdapter.initRawPosts(foundPosts, { currentUser: currentUserId, maxComments: 'all' })

      const postsCollectionJson = await SearchController._serializePostsCollection(postsObjects)

      res.jsonp(postsCollectionJson)
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async _serializePostsCollection(postsObjects) {
    const postsCollection = await Promise.all(postsObjects.map((post) => new PostSerializer(post).promiseToJSON()))
    const postsCollectionJson = {
      posts:         [],
      comments:      [],
      attachments:   [],
      subscriptions: [],
      admins:        [],
      users:         [],
      subscribers:   []
    }

    const transformPosts = (result, val) => {
      result.posts.push(val.posts)
      result.comments       = _.uniqBy(result.comments.concat(val.comments || []), 'id')
      result.attachments    = _.uniqBy(result.attachments.concat(val.attachments || []), 'id')
      result.subscriptions  = _.uniqBy(result.subscriptions.concat(val.subscriptions || []), 'id')
      result.admins         = _.uniqBy(result.admins.concat(val.admins || []), 'id')
      result.users          = _.uniqBy(result.users.concat(val.users || []), 'id')
      result.subscribers    = _.uniqBy(result.subscribers.concat(val.subscribers || []), 'id')

      return result
    };

    return _.reduce(postsCollection, transformPosts, postsCollectionJson)
  }
}
