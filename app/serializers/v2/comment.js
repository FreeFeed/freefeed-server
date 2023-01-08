import { pick } from 'lodash';

import { dbAdapter, Comment } from '../../models';

import { serializeUsersByIds } from './user';

export async function serializeComment(comment, viewerId) {
  const comments = {
    ...pick(comment, ['id', 'body', 'createdAt', 'seqNumber']),
    createdBy: comment.userId,
  };

  const users = await serializeUsersByIds([comment.userId], viewerId);

  return { comments, users, admins: users };
}

export async function serializeCommentFull(comment, viewerId) {
  const comments = {
    ...pick(comment, ['id', 'body', 'createdAt', 'updatedAt', 'seqNumber', 'postId', 'hideType']),
    createdBy: comment.userId,
  };
  const isBanned = await dbAdapter.isCommentBannedForViewer(comment.id, viewerId);

  let users = [];

  if (isBanned) {
    comments.likes = 0;
    comments.hasOwnLike = false;

    comments.hideType = Comment.HIDDEN_BANNED;
    comments.body = Comment.hiddenBody(Comment.HIDDEN_BANNED);
    comments.createdBy = null;
  } else {
    const [commentLikesData = { c_likes: 0, has_own_like: false }] =
      await dbAdapter.getLikesInfoForComments([comment.id], viewerId);
    comments.likes = parseInt(commentLikesData.c_likes);
    comments.hasOwnLike = commentLikesData.has_own_like;
    users = await serializeUsersByIds([comment.userId], viewerId);
  }

  return { comments, users, admins: users };
}
