import monitor from 'monitor-dog'

import { dbAdapter, CommentSerializer, PubSub } from '../../../models'
import { ForbiddenException, NotFoundException } from '../../../support/exceptions'


export default class CommentsController {
  static async create(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return
    }

    const timer = monitor.timer('comments.create-time')

    try {
      const post = await dbAdapter.getPostById(ctx.request.body.comment.postId)
      if (!post) {
        throw new NotFoundException('Not found')
      }

      const isVisible = await post.canShow(ctx.state.user.id)
      if (!isVisible) {
        throw new NotFoundException('Not found')
      }

      const author = await dbAdapter.getUserById(post.userId);
      const banIds = await author.getBanIds();

      if (banIds.includes(ctx.state.user.id)) {
        throw new ForbiddenException('Author of this post has banned you');
      }

      const yourBanIds = await ctx.state.user.getBanIds();

      if (yourBanIds.includes(author.id)) {
        throw new ForbiddenException('You have banned the author of this post');
      }

      if (post.commentsDisabled === '1' && post.userId !== ctx.state.user.id) {
        throw new ForbiddenException('Comments disabled')
      }

      const newComment = ctx.state.user.newComment({
        body:   ctx.request.body.comment.body,
        postId: ctx.request.body.comment.postId
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
      ctx.body = json
    } finally {
      timer.stop()
    }
  }

  static async update(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return
    }

    const timer = monitor.timer('comments.update-time')

    try {
      const comment = await dbAdapter.getCommentById(ctx.params.commentId)

      if (null === comment) {
        throw new NotFoundException("Can't find comment")
      }

      if (comment.userId != ctx.state.user.id) {
        throw new ForbiddenException(
          "You can't update another user's comment"
        )
      }

      await comment.update({ body: ctx.request.body.comment.body })
      const json = await new CommentSerializer(comment).promiseToJSON()
      ctx.body = json
      monitor.increment('comments.updates')
    } finally {
      timer.stop()
    }
  }

  static async destroy(ctx) {
    if (!ctx.state.user) {
      ctx.status = 401;
      ctx.body = { err: 'Not found' };
      return
    }

    const timer = monitor.timer('comments.destroy-time')

    try {
      const comment = await dbAdapter.getCommentById(ctx.params.commentId)

      if (null === comment) {
        throw new NotFoundException("Can't find comment")
      }

      if (comment.userId !== ctx.state.user.id) {
        const post = await dbAdapter.getPostById(comment.postId);

        if (null === post) {
          throw new NotFoundException("Can't find post")
        }

        if (post.userId !== ctx.state.user.id) {
          throw new ForbiddenException(
            "You don't have permission to delete this comment"
          )
        }
      }

      await comment.destroy()

      ctx.body = {};
      monitor.increment('comments.destroys')
    } finally {
      timer.stop()
    }
  }
}
