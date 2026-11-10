import type { UUID } from '../types';

import { UndoEntry } from './entry';

export const UNDO_ARTICLE_DELETE = 'articleDelete';

export class UndoArticleDelete extends UndoEntry<typeof UNDO_ARTICLE_DELETE, { articleId: UUID }> {
  private readonly articleId: UUID;

  constructor(articleId: UUID) {
    super(UNDO_ARTICLE_DELETE);
    this.articleId = articleId;
  }

  public serialize(issuer: UUID, message: string, extra: object) {
    return this.createUndoEntry(issuer, { articleId: this.articleId }, message, extra);
  }
}
