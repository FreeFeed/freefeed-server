import monitor from 'monitor-dog'

import { Comment, CommentSerializer, PubSub } from '../../../models'
import exceptions, { ForbiddenException } from '../../../support/exceptions'


export default class CommentsController {
  static async create(req, res) {
    if (!req.user)
      return res.status(401).jsonp({ err: 'Not found' })

    var timer = monitor.timer('comments.create-time')

    try {
      await req.user.validateCanComment(req.body.comment.postId)

      var newComment = req.user.newComment({
        body: req.body.comment.body,
        postId: req.body.comment.postId
      })

      let timelines = await newComment.create()

      let json = await new CommentSerializer(newComment).promiseToJSON()
      res.jsonp(json)

      await PubSub.newComment(newComment, timelines)
      monitor.increment('comments.creates')
    } catch (e) {
      exceptions.reportError(res)(e)
    } finally {
      timer.stop()
    }
  }

  static async update(req, res) {
    if (!req.user)
      return res.status(401).jsonp({ err: 'Not found' })

    var timer = monitor.timer('comments.update-time')

    try {
      var comment = await Comment.getById(req.params.commentId)

      if (comment.userId != req.user.id) {
        throw new ForbiddenException(
          "You can't update another user's comment"
        )
      }

      await comment.update({
        body: req.body.comment.body
      })

      new CommentSerializer(comment).toJSON(function (err, json) {
        res.jsonp(json)
      })
      monitor.increment('comments.updates')
    } catch (e) {
      exceptions.reportError(res)(e)
    } finally {
      timer.stop()
    }
  }

  static async destroy(req, res) {
    if (!req.user)
      return res.status(401).jsonp({ err: 'Not found' })

    var timer = monitor.timer('comments.destroy-time')

    try {
      var comment = await Comment.getById(req.params.commentId);

      if (comment.userId != req.user.id) {
        throw new ForbiddenException(
          "You can't delete another user's comment"
        )
      }

      await comment.destroy()

      res.jsonp({})
      monitor.increment('comments.destroys')
    } catch (e) {
      exceptions.reportError(res)(e)
    } finally {
      timer.stop()
    }
  }
}
