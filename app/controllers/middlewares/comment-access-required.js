import {
  ServerErrorException,
  NotFoundException,
  ForbiddenException,
} from '../../support/exceptions';
import { dbAdapter, Comment } from '../../models';

import { postAccessRequired } from './post-access-required';

import { applyMiddleware } from '.';

/**
 * Checks if the current user has access to the comment. It also checks access
 * to the comment's post. This middleware fills ctx.state.comment and
 * ctx.state.post.
 *
 * It requires ctx.params.commentId or (ctx.params.seqNumber and
 * ctx.params.postId).
 *
 * If the required parameter 'mustBeVisible' is true, it throws
 * ForbiddenException on comment from banned user or other hidden comment.
 * Otherwise, it returns comment as with non-empty hideType and with placeholder
 * body.
 *
 * @param {{ mustBeVisible: bool}} options
 * @returns {import("koa").Middleware}
 */
export function commentAccessRequired({ mustBeVisible }) {
  return async (ctx, next) => {
    const { user: viewer } = ctx.state;

    if (!ctx.params.commentId && !ctx.params.seqNumber) {
      throw new ServerErrorException(
        `Server misconfiguration: the required parameters 'commentId' or 'seqNumber' are missing`,
      );
    }

    /** @type {Comment|null}*/
    let comment;

    if (ctx.params.commentId) {
      comment = await dbAdapter.getCommentById(ctx.params.commentId);
    } else if (ctx.params.seqNumber && ctx.params.postId) {
      const number = Number.parseInt(ctx.params.seqNumber, 10);
      comment = await dbAdapter.getCommentBySeqNumber(
        ctx.params.postId,
        Number.isFinite(number) ? number : -1,
      );
    } else {
      throw new ServerErrorException(
        `Server misconfiguration: the required parameters 'commentId' or 'seqNumber' are missing`,
      );
    }

    if (!comment) {
      throw new NotFoundException("Can't find comment");
    }

    // Check post access first and then the comment access
    ctx.params.postId = comment.postId;
    await applyMiddleware(postAccessRequired(), ctx);

    if (await dbAdapter.isCommentBannedForViewer(comment.id, viewer?.id)) {
      if (mustBeVisible) {
        throw new ForbiddenException('You have banned the author of this comment');
      } else {
        comment.setHideType(Comment.HIDDEN_BANNED);
      }
    }

    if (comment.hideType !== Comment.VISIBLE && mustBeVisible) {
      throw new ForbiddenException(`You don't have access to this comment`);
    }

    ctx.state.comment = comment;

    await next();
  };
}
