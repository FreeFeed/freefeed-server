import { dbAdapter } from '../../../models'
import { ForbiddenException, NotFoundException } from '../../../support/exceptions'
import { userSerializerFunction } from './helpers';

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

    const actualCommentLikes = await dbAdapter.createCommentLike(comment.id, ctx.state.user.id);
    const users = await CommentLikesController._serializeLikers(actualCommentLikes);

    ctx.body = {
      likes: actualCommentLikes,
      users
    };
  }

  static async unlike(ctx) {
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
      throw new ForbiddenException("You can't un-like your own comment");
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
    if (!userLikedComment) {
      throw new ForbiddenException("You can't un-like comment that you haven't yet liked");
    }

    const actualCommentLikes = await dbAdapter.deleteCommentLike(comment.id, ctx.state.user.id);
    const users = await CommentLikesController._serializeLikers(actualCommentLikes);

    ctx.body = {
      likes: actualCommentLikes,
      users
    };
  }


  static async _serializeLikers(commentLikesData) {
    const userIds = commentLikesData.map((l) => l.userId);

    //
    const [allUsersAssoc, allStatsAssoc] = await Promise.all([
      dbAdapter.getUsersByIdsAssoc(userIds),
      dbAdapter.getUsersStatsAssoc(userIds),
    ]);

    const serializeUser = userSerializerFunction(allUsersAssoc, allStatsAssoc);

    const users = Object.keys(allUsersAssoc).map(serializeUser).filter((u) => u.type === 'user');
    //

    return users;
  }
}
