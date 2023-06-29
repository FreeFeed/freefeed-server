import compose from 'koa-compose';

import { dbAdapter } from '../../../models';
import { ForbiddenException } from '../../../support/exceptions';
import { serializeUsersByIds } from '../../../serializers/v2/user';
import { authRequired, monitored, commentAccessRequired } from '../../middlewares';

export default class CommentLikesController {
  static like = compose([
    authRequired(),
    commentAccessRequired({ mustBeVisible: true }),
    monitored('comments.like'),
    async (ctx) => {
      const { comment, user } = ctx.state;

      if (comment.userId === user.id) {
        throw new ForbiddenException("You can't like your own comment");
      }

      const ok = await comment.addLike(user);

      if (!ok) {
        throw new ForbiddenException("You can't like comment that you have already liked");
      }

      // Return likes list
      await CommentLikesController.likes(ctx);
    },
  ]);

  static unlike = compose([
    authRequired(),
    commentAccessRequired({ mustBeVisible: true }),
    monitored('comments.unlike'),
    async (ctx) => {
      const { comment, user } = ctx.state;

      if (comment.userId === user.id) {
        throw new ForbiddenException("You can't un-like your own comment");
      }

      const ok = await comment.removeLike(user);

      if (!ok) {
        throw new ForbiddenException("You can't un-like comment that you haven't yet liked");
      }

      // Return likes list
      await CommentLikesController.likes(ctx);
    },
  ]);

  static likes = compose([
    commentAccessRequired({ mustBeVisible: true }),
    async (ctx) => {
      const { comment, user } = ctx.state;

      const commentIntId = await dbAdapter._getCommentIntIdByUUID(comment.id);
      const likes = await dbAdapter.getCommentLikesWithoutBannedUsers(commentIntId, user?.id);

      const users = await serializeUsersByIds(
        likes.map((l) => l.userId),
        user?.id,
      );

      ctx.body = { likes, users };
    },
  ]);
}
