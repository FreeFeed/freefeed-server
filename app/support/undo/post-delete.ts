import type { UUID } from '../types';

import { UndoEntry } from './entry';

export const UNDO_POST_DELETE = 'postDelete';

export class UndoPostDelete extends UndoEntry<typeof UNDO_POST_DELETE, { postId: UUID }> {
  private readonly postId: UUID;

  constructor(postId: UUID) {
    super(UNDO_POST_DELETE);
    this.postId = postId;
  }

  public serialize(issuer: UUID, message: string, extra: object) {
    return this.createUndoEntry(issuer, { postId: this.postId }, message, extra);
  }
}
