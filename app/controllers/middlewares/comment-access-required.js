import { ServerErrorException, NotFoundException, ForbiddenException } from '../../support/exceptions';
import { dbAdapter, Comment } from '../../models';

import { postAccessRequired } from './post-access-required';

/**
 * Checks if the current user has access to the comment. It also checks access
 * to the comment's post. This middleware fills ctx.state.comment and
 * ctx.state.post.
 */
export function commentAccessRequired() {
  return async (ctx, next) => {
    const { user: viewer } = ctx.state;

    if (!ctx.params.commentId) {
      throw new ServerErrorException(`Server misconfiguration: the required parameter 'commentId' is missing`);
    }

    const { commentId } = ctx.params;
    const comment = await dbAdapter.getCommentById(commentId);

    if (!comment) {
      throw new NotFoundException("Can't find comment");
    }

    // Check post access first and then the comment access
    ctx.params.postId = comment.postId;
    await new Promise((resolve, reject) => postAccessRequired()(ctx, resolve).then((x) => x, reject));

    const viewerBanIds = viewer ? await viewer.getBanIds() : [];

    if (viewerBanIds.includes(comment.userId)) {
      throw new ForbiddenException('You have banned by the author of this comment');
    }

    if (comment.hideType !== Comment.VISIBLE) {
      throw new ForbiddenException(`You don't have access to this comment`);
    }

    ctx.state.comment = comment;

    await next();
  };
}
