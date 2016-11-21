import monitor from 'monitor-dog'

import { dbAdapter, CommentSerializer, PubSub } from '../../../models'
import { reportError, ForbiddenException, NotFoundException } from '../../../support/exceptions'


export default class CommentsController {
  static async create(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    const timer = monitor.timer('comments.create-time')

    try {
      const post = await dbAdapter.getPostById(req.body.comment.postId)
      if (!post) {
        throw new NotFoundException('Not found')
      }

      const isVisible = await post.canShow(req.user.id)
      if (!isVisible) {
        throw new NotFoundException('Not found')
      }

      const author = await dbAdapter.getUserById(post.userId);
      const banIds = await author.getBanIds();

      if (banIds.includes(req.user.id)) {
        throw new ForbiddenException('Author of this post has banned you');
      }

      const yourBanIds = await req.user.getBanIds();

      if (yourBanIds.includes(author.id)) {
        throw new ForbiddenException('You have banned the author of this post');
      }

      if (post.commentsDisabled === '1' && post.userId !== req.user.id) {
        throw new ForbiddenException('Comments disabled')
      }

      const newComment = req.user.newComment({
        body:   req.body.comment.body,
        postId: req.body.comment.postId
      })

      const timelines = await newComment.create()

      await Promise.all(timelines.map(async (timeline) => {
        if (timeline.isDirects()) {
          await PubSub.updateUnreadDirects(timeline.userId)
        }
      }))

      await PubSub.newComment(newComment, timelines)
      monitor.increment('comments.creates')

      const json = await new CommentSerializer(newComment).promiseToJSON()
      res.jsonp(json)
    } catch (e) {
      reportError(res)(e)
    } finally {
      timer.stop()
    }
  }

  static async update(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    const timer = monitor.timer('comments.update-time')

    try {
      const comment = await dbAdapter.getCommentById(req.params.commentId)

      if (null === comment) {
        throw new NotFoundException("Can't find comment")
      }

      if (comment.userId != req.user.id) {
        throw new ForbiddenException(
          "You can't update another user's comment"
        )
      }

      await comment.update({ body: req.body.comment.body })
      const json = await new CommentSerializer(comment).promiseToJSON()
      res.jsonp(json)
      monitor.increment('comments.updates')
    } catch (e) {
      reportError(res)(e)
    } finally {
      timer.stop()
    }
  }

  static async destroy(req, res) {
    if (!req.user) {
      res.status(401).jsonp({ err: 'Not found' })
      return
    }

    const timer = monitor.timer('comments.destroy-time')

    try {
      const comment = await dbAdapter.getCommentById(req.params.commentId)

      if (null === comment) {
        throw new NotFoundException("Can't find comment")
      }

      if (comment.userId !== req.user.id) {
        const post = await dbAdapter.getPostById(comment.postId);

        if (null === post) {
          throw new NotFoundException("Can't find post")
        }

        if (post.userId !== req.user.id) {
          throw new ForbiddenException(
            "You don't have permission to delete this comment"
          )
        }
      }

      await comment.destroy()

      res.jsonp({})
      monitor.increment('comments.destroys')
    } catch (e) {
      reportError(res)(e)
    } finally {
      timer.stop()
    }
  }
}
