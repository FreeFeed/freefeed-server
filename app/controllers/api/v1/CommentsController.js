import compose from 'koa-compose';
import { difference, uniq } from 'lodash-es';
import validator from 'validator';

import monitor from '../../../support/monitor';
import { dbAdapter, Comment, AppTokenV1 } from '../../../models';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '../../../support/exceptions';
import {
  serializeComment,
  serializeCommentFull,
  serializeCommentsFull,
} from '../../../serializers/v2/comment';
import {
  authRequired,
  inputSchemaRequired,
  postAccessRequired,
  monitored,
  commentAccessRequired,
} from '../../middlewares';
import { postMayUpdateForUser } from '../../middlewares/post-may-update-for-user';
import { UndoCommentDelete } from '../../../support/undo/comment-delete';

import { commentCreateInputSchema, commentUpdateInputSchema } from './data-schemes';
import { getCommentsByIdsInputSchema } from './data-schemes/comments';

export const create = compose([
  authRequired(),
  inputSchemaRequired(commentCreateInputSchema),
  async (ctx, next) => {
    // for the postAccessRequired check
    ctx.params.postId = ctx.request.body.comment.postId;
    await next();
  },
  postAccessRequired(),
  postMayUpdateForUser(),
  monitored('comments.create'),
  async (ctx) => {
    const { user: author, post } = ctx.state;
    const {
      comment: { body, postId },
    } = ctx.request.body;

    if (post.commentsDisabled === '1' && !(await post.isAuthorOrGroupAdmin(author))) {
      throw new ForbiddenException('Comments disabled');
    }

    const comment = new Comment({ body, postId, userId: author.id });

    try {
      await comment.create();
    } catch (e) {
      throw new BadRequestException(`Can not create comment: ${e.message}`);
    }

    AppTokenV1.addLogPayload(ctx, { commentId: comment.id });
    ctx.body = await serializeComment(comment, author.id);
  },
]);

export const update = compose([
  authRequired(),
  commentAccessRequired({ mustBeVisible: true }),
  inputSchemaRequired(commentUpdateInputSchema),
  monitored('comments.update'),
  async (ctx) => {
    const { user, comment } = ctx.state;

    if (comment.userId !== user.id) {
      throw new ForbiddenException("You can't update another user's comment");
    }

    try {
      await comment.update({ body: ctx.request.body.comment.body });
    } catch (e) {
      throw new BadRequestException(`Can not update comment: ${e.message}`);
    }

    ctx.body = await serializeComment(comment, user.id);
  },
]);

export const destroy = compose([
  authRequired(),
  // Post owner or group admin can delete hidden comments
  commentAccessRequired({ mustBeVisible: false }),
  postMayUpdateForUser(({ comment }) =>
    // Re-fetch comment creator because it may be set to null in commentAccessRequired
    dbAdapter.getCommentById(comment.id).then((c) => c.getCreatedBy()),
  ),
  monitored('comments.destroy'),
  async (ctx) => {
    const { user, post, comment } = ctx.state;

    if (!comment.canBeDestroyed()) {
      throw new ForbiddenException('You can not destroy a deleted comment');
    }

    if (comment.userId !== user.id && !(await post.isAuthorOrGroupAdmin(user))) {
      throw new ForbiddenException("You don't have permission to delete this comment");
    }

    const undo = [];

    if (await comment.inactivate(user)) {
      const author = comment.userId ? await dbAdapter.getUserById(comment.userId) : null;
      let message = 'You delete hidden comment';

      if (author?.id === user.id) {
        message = 'You deleted your comment';
      } else if (author) {
        message = `You deleted ${author.username}'s comment`;
      }

      undo.push(
        new UndoCommentDelete(comment.id).serialize(user.id, message, {
          author: author?.username ?? null,
        }),
      );

      monitor.increment('comments.destroys');
    }

    ctx.body = { undo };
  },
]);

export const getById = compose([
  commentAccessRequired({ mustBeVisible: false, bannedUnlockParam: 'unlock-banned' }),
  async (ctx) => {
    const { comment, user, unlockBannedComments } = ctx.state;
    ctx.body = await serializeCommentFull(comment, user?.id, { unlockBannedComments });
  },
]);

const maxCommentsByIds = 100;

export const getByIds = compose([
  inputSchemaRequired(getCommentsByIdsInputSchema),
  monitored('comments.by-ids'),
  async (ctx) => {
    const { user: viewer } = ctx.state;
    const { commentIds } = ctx.request.body;

    const hasMore = commentIds.length > maxCommentsByIds;

    if (hasMore) {
      commentIds.length = maxCommentsByIds;
    }

    const allComments = (await dbAdapter.getCommentsByIds(commentIds)).filter((c) => !c.toDelete);
    const postIds = uniq(allComments.map((c) => c.postId));

    const visiblePostIds = await dbAdapter.selectPostsVisibleByUser(postIds, viewer?.id);
    const visibleComments = allComments.filter((c) => visiblePostIds.includes(c.postId));
    const commentsNotFound = difference(
      commentIds,
      visibleComments.map((c) => c.id),
    );

    ctx.body = await serializeCommentsFull(visibleComments, viewer?.id);
    ctx.body.commentsNotFound = commentsNotFound;
  },
]);

export async function getBySeqNumber(ctx) {
  const { postId, seqNumber } = ctx.params;

  const number = Number.parseInt(seqNumber, 10);
  const comment = await dbAdapter.getCommentBySeqNumber(
    postId,
    Number.isFinite(number) ? number : -1,
  );

  if (!comment) {
    throw new NotFoundException('Comment not found');
  }

  ctx.params.commentId = comment.id;

  await getById(ctx);
}

export async function getByPostAndCommentId(ctx) {
  let { postId } = ctx.params;
  const { commentId } = ctx.params;

  // Resolve short post ID to UUID
  if (!validator.isUUID(postId)) {
    postId = (await dbAdapter.getPostLongId(postId)) ?? postId;
  }

  let comment;

  if (validator.isUUID(commentId)) {
    comment = await dbAdapter.getCommentById(commentId);

    if (comment?.postId !== postId) {
      comment = null;
    }
  } else {
    comment = await dbAdapter.getCommentByShortId(postId, commentId);
  }

  if (!comment) {
    throw new NotFoundException('Comment not found');
  }

  ctx.params.commentId = comment.id;

  await getById(ctx);
}
