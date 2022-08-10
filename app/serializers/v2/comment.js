import { pick } from 'lodash';

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
  const users = await serializeUsersByIds([comment.userId], viewerId);
  return { comments, users, admins: users };
}
