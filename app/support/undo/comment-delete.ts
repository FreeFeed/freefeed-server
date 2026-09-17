import type { UUID } from '../types';

import { UndoEntry } from './entry';

export const UNDO_COMMENT_DELETE = 'commentDelete';

export class UndoCommentDelete extends UndoEntry<typeof UNDO_COMMENT_DELETE, { commentId: UUID }> {
  private readonly commentId: UUID;

  constructor(commentId: UUID) {
    super(UNDO_COMMENT_DELETE);
    this.commentId = commentId;
  }

  public serialize(issuer: UUID, message: string, extra: object) {
    return this.createUndoEntry(issuer, { commentId: this.commentId }, message, extra);
  }
}
