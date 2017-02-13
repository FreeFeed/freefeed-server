import { dbAdapter } from '../../../models'
import { ForbiddenException, NotFoundException } from '../../../support/exceptions'

export default class CommentLikesController {
  static async like(ctx) {
    if (!ctx.state.user) {
      ctx.status = 403;
      ctx.body = { err: 'Unauthorized' };
      return;
    }

    const comment = await dbAdapter.getCommentById(ctx.params.commentId);
    if (null === comment) {
      throw new NotFoundException("Can't find comment");
    }

    const post = await dbAdapter.getPostById(comment.postId);
    if (null === post) {
      throw new NotFoundException("Can't find post");
    }

    const commentAuthorId = comment.userId;
    if (commentAuthorId === ctx.state.user.id) {
      throw new ForbiddenException("You can't like your own comment");
    }

    const isVisible = await post.canShow(ctx.state.user.id);
    if (!isVisible) {
      throw new NotFoundException("Can't find post");
    }

    const yourBanIds = await ctx.state.user.getBanIds();
    if (yourBanIds.includes(commentAuthorId)) {
      throw new ForbiddenException('You have banned the author of this comment');
    }

    const userLikedComment = await dbAdapter.hasUserLikedComment(comment.id, ctx.state.user.id);
    if (userLikedComment) {
      throw new ForbiddenException("You can't like comment that you have already liked");
    }

    const actualLikersIds = await dbAdapter.createCommentLike(comment.id, ctx.state.user.id);

    ctx.body = { likes: actualLikersIds };
  }
}
