import _ from 'lodash'

import { FeedFactory, Post, PostSerializer, PubSub as pubSub, Stats, User } from '../../../models'
import exceptions, { ForbiddenException } from '../../../support/exceptions'


export default class PostsController {
  static async create(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    var feeds = []
    req.body.meta = req.body.meta || {}

    if (_.isArray(req.body.meta.feeds)) {
      feeds = req.body.meta.feeds
    } else if (req.body.meta.feeds) {
      feeds = [req.body.meta.feeds]
    } else {
      res.status(401).jsonp({ err: 'Cannot publish post to /dev/null' })
      return
    }

    try {
      let promises = feeds.map(async (username) => {
        let feed = await FeedFactory.findByUsername(username)
        await feed.validateCanPost(req.user)

        // we are going to publish this message to posts feed if
        // it's my home feed or group's feed, otherwise this is a
        // private message that goes to its own feed(s)
        if (
          (feed.isUser() && feed.id == req.user.id) ||
          !feed.isUser()
        ) {
          return feed.getPostsTimelineId()
        }

        // private post goes to sendee and sender
        return await Promise.all([
          feed.getDirectsTimelineId(),
          req.user.getDirectsTimelineId()
        ])
      })
      let timelineIds = _.flatten(await Promise.all(promises))

      let newPost = await req.user.newPost({
        body: req.body.post.body,
        attachments: req.body.post.attachments,
        timelineIds: timelineIds
      })

      await newPost.create()

      let json = await new PostSerializer(newPost).promiseToJSON()
      res.jsonp(json)
    } catch (e) {
      exceptions.reportError(res)(e)
    }
  }

  static async update(req, res) {
    if (!req.user)
      return res.status(401).jsonp({ err: 'Not found' })

    try {
      const post = await Post.findById(req.params.postId)

      if (post.userId != req.user.id) {
        throw new ForbiddenException("You can't update another user's post")
      }

      await post.update({
        body: req.body.post.body,
        attachments: req.body.post.attachments
      })

      let json = await new PostSerializer(post).promiseToJSON()
      res.jsonp(json)
    } catch (e) {
      exceptions.reportError(res)(e)
    }
  }

  static async show(req, res) {
    try {
      var userId = req.user ? req.user.id : null
      var post = await Post.getById(req.params.postId, {
        maxComments: req.query.maxComments,
        maxLikes: req.query.maxLikes,
        currentUser: userId
      })

      var valid = await post.canShow(userId)

      // this is a private post
      if (!valid)
        throw new ForbiddenException("Not found")

      if (post.currentUser) {
        let author = await User.findById(post.userId)
        let banIds = await author.getBanIds()

        if (banIds.indexOf(post.currentUser) >= 0)
          throw new ForbiddenException("This user has prevented you from seeing their posts")

        let you = await User.findById(post.currentUser)

        if (you) {
          let yourBanIds = await you.getBanIds()

          if (yourBanIds.indexOf(author.id) >= 0)
            throw new ForbiddenException("You have blocked this user and do not want to see their posts")
        }
      }

      var json = new PostSerializer(post).promiseToJSON()

      res.jsonp(await json)
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async like(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    try {
      let post = await Post.getById(req.params.postId)
      let affectedTimelines = await post.addLike(req.user)

      let stats = await Stats.findById(req.user.id)
      await stats.addLike()

      res.status(200).send({})

      await pubSub.newLike(post, req.user.id, affectedTimelines)
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async unlike(req, res) {
    if (!req.user)
      return res.status(401).jsonp({ err: 'Not found' })

    try {
      let post = await Post.getById(req.params.postId)
      await post.removeLike(req.user.id)
      res.status(200).send({})
    } catch(e) {
      exceptions.reportError(res)(e)
    }
  }

  static async destroy(req, res) {
    if (!req.user)
      return res.status(401).jsonp({ err: 'Not found' })

    try {
      const post = await Post.getById(req.params.postId)

      if (post.userId != req.user.id) {
        throw new ForbiddenException("You can't delete another user's post")
      }

      await post.destroy()
      res.jsonp({})
    } catch (e) {
      exceptions.reportError(res)(e)
    }
  }

  static async hide(req, res) {
    if (!req.user)
      return res.status(401).jsonp({ err: 'Not found' })

    try {
      const post = await Post.getById(req.params.postId)
      await post.hide(req.user.id)
      res.jsonp({})
    } catch (e) {
      exceptions.reportError(res)(e)
    }
  }

  static async unhide(req, res) {
    if (!req.user)
      return res.status(401).jsonp({ err: 'Not found' })

    try {
      const post = await Post.getById(req.params.postId)
      await post.unhide(req.user.id)
      res.jsonp({})
    } catch (e) {
      exceptions.reportError(res)(e)
    }
  }
}
