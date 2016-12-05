import _ from 'lodash'
import monitor from 'monitor-dog';

import { dbAdapter, PostSerializer, PubSub as pubSub } from '../../../models'
import { reportError, ForbiddenException, NotFoundException } from '../../../support/exceptions'


export default class PostsController {
  static async create(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    const timer = monitor.timer('posts.create-time');

    req.body.meta = req.body.meta || {}

    let feeds = []
    if (_.isArray(req.body.meta.feeds)) {
      feeds = req.body.meta.feeds
    } else if (req.body.meta.feeds) {
      feeds = [req.body.meta.feeds]
    } else {
      res.status(401).jsonp({ err: 'Cannot publish post to /dev/null' })
      return
    }

    const commentsDisabled = (req.body.meta.commentsDisabled ? '1' : '0')

    try {
      const promises = feeds.map(async (username) => {
        const feed = await dbAdapter.getFeedOwnerByUsername(username)
        if (null === feed) {
          return null
        }

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
      const timelineIds = _.flatten(await Promise.all(promises))
      _.each(timelineIds, (id, i) => {
        if (null == id) {
          throw new NotFoundException(`Feed "${feeds[i]}" is not found`)
        }
      })

      const newPost = await req.user.newPost({
        body:        req.body.post.body,
        attachments: req.body.post.attachments,
        timelineIds,
        commentsDisabled
      })

      await newPost.create()

      const json = await new PostSerializer(newPost).promiseToJSON()
      res.jsonp(json)

      monitor.increment('posts.creates');
    } catch (e) {
      reportError(res)(e)
    } finally {
      timer.stop();
    }
  }

  static async update(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    try {
      const post = await dbAdapter.getPostById(req.params.postId)

      if (post.userId != req.user.id) {
        throw new ForbiddenException("You can't update another user's post")
      }

      await post.update({
        body:        req.body.post.body,
        attachments: req.body.post.attachments
      })

      const json = await new PostSerializer(post).promiseToJSON()
      res.jsonp(json)
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async show(req, res) {
    const timer = monitor.timer('posts.show-time');

    try {
      const userId = req.user ? req.user.id : null
      const post = await dbAdapter.getPostById(req.params.postId, {
        maxComments: req.query.maxComments,
        maxLikes:    req.query.maxLikes,
        currentUser: userId
      })

      if (null === post) {
        throw new NotFoundException("Can't find post");
      }

      const valid = await post.canShow(userId)

      // this is a private post
      if (!valid)
        throw new ForbiddenException('Not found')

      if (req.user) {
        const banIds = await dbAdapter.getUserBansIds(post.userId)

        if (banIds.includes(req.user.id))
          throw new ForbiddenException('This user has prevented you from seeing their posts')

        const yourBanIds = await req.user.getBanIds()

        if (yourBanIds.includes(post.userId))
          throw new ForbiddenException('You have blocked this user and do not want to see their posts')
      }

      const json = new PostSerializer(post).promiseToJSON()
      res.jsonp(await json)

      monitor.increment('posts.show-requests');
    } catch (e) {
      reportError(res)(e)
    } finally {
      timer.stop();
    }
  }

  static async like(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not authenticated' })
      return
    }

    const timer = monitor.timer('posts.likes.time');

    try {
      const post = await dbAdapter.getPostById(req.params.postId)

      if (null === post) {
        throw new NotFoundException("Can't find post");
      }

      const authorId = post.userId;

      if (authorId === req.user.id) {
        throw new ForbiddenException("You can't like your own post")
      }

      const isVisible = await post.canShow(req.user.id)
      if (!isVisible) {
        throw new NotFoundException("Can't find post");
      }

      const banIds = await dbAdapter.getUserBansIds(authorId);

      if (banIds.includes(req.user.id)) {
        throw new ForbiddenException('Author of this post has banned you');
      }

      const yourBanIds = await req.user.getBanIds();

      if (yourBanIds.includes(authorId)) {
        throw new ForbiddenException('You have banned the author of this post');
      }

      const userLikedPost = await dbAdapter.hasUserLikedPost(req.user.id, post.id)

      if (userLikedPost) {
        throw new ForbiddenException("You can't like post that you have already liked")
      }

      try {
        const affectedTimelines = await post.addLike(req.user)

        await dbAdapter.statsLikeCreated(req.user.id)

        res.status(200).send({})

        await pubSub.newLike(post, req.user.id, affectedTimelines)

        monitor.increment('posts.likes');
        monitor.increment('posts.reactions');
      } catch (e) {
        if (e.code === '23505') {
          // '23505' stands for unique_violation
          // see https://www.postgresql.org/docs/current/static/errcodes-appendix.html
          throw new ForbiddenException("You can't like post that you have already liked")
        }

        throw e;
      }
    } catch (e) {
      reportError(res)(e)
    } finally {
      timer.stop();
    }
  }

  static async unlike(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    const timer = monitor.timer('posts.unlikes.time');

    try {
      const post = await dbAdapter.getPostById(req.params.postId)

      if (null === post) {
        throw new NotFoundException("Can't find post");
      }

      if (post.userId === req.user.id) {
        throw new ForbiddenException("You can't un-like your own post")
      }

      const author = await dbAdapter.getUserById(post.userId);
      const banIds = await author.getBanIds();

      if (banIds.includes(req.user.id)) {
        throw new ForbiddenException('Author of this post has blocked you');
      }

      const yourBanIds = await req.user.getBanIds();

      if (yourBanIds.includes(author.id)) {
        throw new ForbiddenException('You have blocked the author of this post');
      }

      const userLikedPost = await dbAdapter.hasUserLikedPost(req.user.id, post.id)
      if (!userLikedPost) {
        throw new ForbiddenException("You can't un-like post that you haven't yet liked")
      }

      const valid = await post.canShow(req.user.id)
      if (!valid) {
        throw new Error('Not found')
      }

      await post.removeLike(req.user.id)

      await dbAdapter.statsLikeDeleted(req.user.id)

      res.status(200).send({})

      monitor.increment('posts.unlikes');
      monitor.increment('posts.unreactions');
    } catch (e) {
      reportError(res)(e)
    } finally {
      timer.stop();
    }
  }

  static async destroy(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    try {
      const post = await dbAdapter.getPostById(req.params.postId)

      if (null === post) {
        throw new NotFoundException("Can't find post");
      }

      if (post.userId != req.user.id) {
        throw new ForbiddenException("You can't delete another user's post")
      }

      await post.destroy()
      res.jsonp({})

      monitor.increment('posts.destroys');
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async hide(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    try {
      const post = await dbAdapter.getPostById(req.params.postId)

      if (null === post) {
        throw new NotFoundException("Can't find post");
      }

      await post.hide(req.user.id)
      res.jsonp({})
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async unhide(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    try {
      const post = await dbAdapter.getPostById(req.params.postId)

      if (null === post) {
        throw new NotFoundException("Can't find post");
      }

      await post.unhide(req.user.id)
      res.jsonp({})
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async disableComments(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Unauthorized' })
      return
    }

    try {
      const post = await dbAdapter.getPostById(req.params.postId)

      if (null === post) {
        throw new NotFoundException("Can't find post");
      }

      if (post.userId != req.user.id) {
        throw new ForbiddenException("You can't disable comments for another user's post")
      }

      await post.setCommentsDisabled('1')

      res.jsonp({})
    } catch (e) {
      reportError(res)(e)
    }
  }

  static async enableComments(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Unauthorized' })
      return
    }

    try {
      const post = await dbAdapter.getPostById(req.params.postId)

      if (null === post) {
        throw new NotFoundException("Can't find post");
      }

      if (post.userId != req.user.id) {
        throw new ForbiddenException("You can't enable comments for another user's post")
      }

      await post.setCommentsDisabled('0')

      res.jsonp({})
    } catch (e) {
      reportError(res)(e)
    }
  }
}
