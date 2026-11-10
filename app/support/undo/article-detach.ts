import type { UUID } from '../types';

import { UndoEntry } from './entry';

export const UNDO_ARTICLE_DETACH = 'articleDetach';

export class UndoArticleDetach extends UndoEntry<
  typeof UNDO_ARTICLE_DETACH,
  { articleId: UUID; postId: UUID }
> {
  private readonly articleId: UUID;
  private readonly postId: UUID;

  constructor(articleId: UUID, postId: UUID) {
    super(UNDO_ARTICLE_DETACH);
    this.articleId = articleId;
    this.postId = postId;
  }

  public serialize(issuer: UUID, message: string, extra: object) {
    return this.createUndoEntry(
      issuer,
      { articleId: this.articleId, postId: this.postId },
      message,
      extra,
    );
  }
}
