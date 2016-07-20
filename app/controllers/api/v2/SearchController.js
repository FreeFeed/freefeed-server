import _ from 'lodash'
import { dbAdapter, PostSerializer } from '../../../models'
import { reportError, NotFoundException, ForbiddenException } from '../../../support/exceptions'
import { SearchQueryParser } from '../../../support/SearchQueryParser'
import { SEARCH_SCOPES } from '../../../support/SearchConstants'

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
        , targetUser
        , targetGroup
      const bannedUserIds = await req.user.getBanIds()

      switch (preparedQuery.scope) {
        case SEARCH_SCOPES.ALL_VISIBLE_POSTS:
          {
            foundPosts = await dbAdapter.searchPosts(preparedQuery.query, req.user.id, req.user.subscribedFeedIds, bannedUserIds)
            break
          }

        case SEARCH_SCOPES.VISIBLE_USER_POSTS:
          {
            targetUser = await dbAdapter.getUserByUsername(preparedQuery.username)
            if (!targetUser) {
              throw new NotFoundException(`User "${preparedQuery.username}" is not found`)
            }

            const userPostsFeedId = await targetUser.getPostsTimelineId()
            isSubscribed          = await dbAdapter.isUserSubscribedToTimeline(req.user.id, userPostsFeedId)
            if (!isSubscribed && targetUser.isPrivate) {
              throw new ForbiddenException(`You are not subscribed to user "${preparedQuery.username}"`)
            }

            foundPosts = await dbAdapter.searchUserPosts(preparedQuery.query, targetUser.id, req.user.subscribedFeedIds, bannedUserIds)

            break
          }
        case SEARCH_SCOPES.VISIBLE_GROUP_POSTS:
          {
            targetGroup = await dbAdapter.getGroupByUsername(preparedQuery.group)
            if (!targetGroup) {
              throw new NotFoundException(`Group "${preparedQuery.group}" is not found`)
            }

            const groupPostsFeedId = await targetGroup.getPostsTimelineId()
            isSubscribed           = await dbAdapter.isUserSubscribedToTimeline(req.user.id, groupPostsFeedId)
            if (!isSubscribed && targetGroup.isPrivate) {
              throw new ForbiddenException(`You are not subscribed to group "${preparedQuery.group}"`)
            }

            foundPosts = await dbAdapter.searchGroupPosts(preparedQuery.query, groupPostsFeedId, req.user.subscribedFeedIds, bannedUserIds)

            break
          }
      }

      const postsObjects = dbAdapter.initRawPosts(foundPosts, { currentUser: req.user.id, maxComments: 'all' })

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
