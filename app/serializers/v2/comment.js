import { pick } from 'lodash';

import { serializeUsersByIds } from './user';


export async function serializeComment(comment) {
  const comments = {
    ...pick(comment, [
      'id',
      'body',
      'createdAt',
    ]),
    createdBy: comment.userId,
  };

  const users = await serializeUsersByIds([comment.userId], false);

  return { comments, users, admins: users };
}

export async function serializeCommentForRealtime(comment) {
  const comments = {
    ...pick(comment, [
      'id',
      'body',
      'createdAt',
      'updatedAt',
      'postId',
      'hideType'
    ]),
    createdBy: comment.userId,
  };

  const users = await serializeUsersByIds([comment.userId], false);

  return { comments, users, admins: users };
}
