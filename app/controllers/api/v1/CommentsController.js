import compose from 'koa-compose';
import monitor from 'monitor-dog';

import { dbAdapter, CommentSerializer, Comment } from '../../../models';
import { ForbiddenException, NotFoundException } from '../../../support/exceptions';
import { serializeComment } from '../../../serializers/v2/comment';
import { authRequired, inputSchemaRequired, postAccessRequired, monitored } from '../../middlewares';
import { commentCreateInputSchema } from './data-schemes';


export const create = compose([
  authRequired(),
  inputSchemaRequired(commentCreateInputSchema),
  async (ctx, next) => {
    // for the postAccessRequired check
    ctx.params.postId = ctx.request.body.comment.postId;
    await next();
  },
  postAccessRequired(),
  monitored('comments.create'),
  async (ctx) => {
    const { user: author, post } = ctx.state;
    const { comment: { body, postId } } = ctx.request.body;

    if (post.commentsDisabled === '1' && post.userId !== author.id) {
      throw new ForbiddenException('Comments disabled');
    }

    const comment = new Comment({ body, postId, userId: author.id });
    await comment.create();

    ctx.body = await serializeComment(comment);
  },
]);

export async function update(ctx) {
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

    if (comment.hideType !== Comment.VISIBLE) {
      throw new ForbiddenException(
        "You can't update deleted or hidden comment"
      )
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

export const destroy = compose([
  authRequired(),
  monitored('comments.destroy'),
  async (ctx) => {
    const { user } = ctx.state;
    const { commentId } = ctx.params;

    const comment = await dbAdapter.getCommentById(commentId);
    if (!comment) {
      throw new NotFoundException('Can not find comment');
    }

    const post = await dbAdapter.getPostById(comment.postId);
    if (!post) {
      // Should not be possible
      throw new NotFoundException('Post not found');
    }

    const isPostVisible = await post.isVisibleFor(user);
    if (!isPostVisible) {
      throw new ForbiddenException('You can not see this post');
    }

    if (!comment.canBeDestroyed()) {
      throw new ForbiddenException('You can not destroy a deleted comment');
    }

    if (comment.userId !== user.id && post.userId !== user.id) {
      throw new ForbiddenException("You don't have permission to delete this comment");
    }

    await comment.destroy();
    monitor.increment('comments.destroys');

    ctx.body = {};
  },
]);
