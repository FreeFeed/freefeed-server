import type { JwtPayload } from 'jsonwebtoken';
import compose from 'koa-compose';
import { z } from 'zod';

import { dbAdapter } from '../../../models';
import type { User } from '../../../models';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '../../../support/exceptions';
import type { Ctx } from '../../../support/types';
import { verifyUndoToken } from '../../../support/undo/entry';
import { authRequired, inputSchemaRequired, monitored } from '../../middlewares';
import { UNDO_POST_DELETE } from '../../../support/undo/post-delete';
import { UNDO_COMMENT_DELETE } from '../../../support/undo/comment-delete';
import { serializeSinglePost } from '../../../serializers/v2/post';
import { serializeCommentFull } from '../../../serializers/v2/comment';
import { UNDO_ARTICLE_DELETE } from '../../../support/undo/article-delete';

import { fullArticleResponse } from './ArticlesController';

const undoInputSchema = z.object({ token: z.jwt() });
type UndoInput = z.infer<typeof undoInputSchema>;

export const undo = compose([
  authRequired(),
  inputSchemaRequired(undoInputSchema),
  monitored((ctx) => `undo:${ctx.params.subject}`),
  async (ctx: Ctx<{ user: User; apiVersion: number }>) => {
    const { user, apiVersion } = ctx.state;
    const { token } = ctx.request.body as UndoInput;
    const { subject } = ctx.params as { subject: string };

    let data: JwtPayload;

    try {
      data = await verifyUndoToken(token, user.id, subject);
    } catch {
      throw new ForbiddenException('Invalid or expired undo token');
    }

    ctx.body = {};

    if (subject === UNDO_POST_DELETE) {
      const post = await dbAdapter.getPostById(data.postId);

      if (!post) {
        throw new NotFoundException('Post not found');
      }

      await post.activate(user);
      ctx.body = await serializeSinglePost(post.id, user.id, { apiVersion });
    } else if (subject === UNDO_COMMENT_DELETE) {
      const comment = await dbAdapter.getCommentById(data.commentId);

      if (!comment) {
        throw new NotFoundException('Comment not found');
      }

      await comment.activate(user);
      ctx.body = await serializeCommentFull(comment, user.id);
    } else if (subject === UNDO_ARTICLE_DELETE) {
      const article = await dbAdapter.getArticleById(data.articleId);

      if (!article) {
        throw new NotFoundException('Article not found');
      }

      await article.activate();
      ctx.body = await fullArticleResponse(user, article);
    } else {
      throw new BadRequestException(`Unknown undo subject: ${subject}`);
    }
  },
]);
