import type { DbAdapter } from '../support/DbAdapter';
import type { UUID } from '../support/types';
import { scheduleArticleDeletion } from '../jobs/delete-article';
import type { User } from '../models';

import type { ArticleBody } from './article-body';

abstract class ArticleContent {
  protected readonly dba: DbAdapter;

  title: string;
  digest: string;
  body: ArticleBody;

  constructor(dba: DbAdapter, dbRow: ArticleDbRowContent) {
    this.dba = dba;
    this.title = dbRow.title;
    this.digest = dbRow.digest;
    this.body = dbRow.body;
  }
}

export type ArticleDbRowContent = {
  title: string;
  digest: string;
  body: ArticleBody;
};

export const ARTICLE_CONTENT_KEYS = [
  'title',
  'digest',
  'body',
] as const satisfies (keyof ArticleDbRowContent)[];

export type ArticleUpdateResult =
  | { status: 'updated'; version: number }
  | { status: 'conflict' }
  | { status: 'not-found' }
  | { status: 'unchanged' };

export class Article extends ArticleContent {
  uid: UUID;
  authorId: UUID;
  postId: UUID | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  toDelete: boolean;

  constructor(dba: DbAdapter, dbRow: ArticleDbRow) {
    super(dba, dbRow);

    this.uid = dbRow.uid;
    this.authorId = dbRow.author_id;
    this.postId = dbRow.post_id;
    this.toDelete = dbRow.to_delete;
    this.createdAt = dbRow.created_at;
    this.updatedAt = dbRow.updated_at;
    this.version = dbRow.version;
  }

  async update(expectedVersion: number, params: ArticleDbRowContent): Promise<ArticleUpdateResult> {
    const result = await this.dba.updateArticle(this.uid, expectedVersion, params);

    if (result.status !== 'updated') {
      return result;
    }

    this.version = result.version;

    // Update the instance properties with the new values
    for (const key of ARTICLE_CONTENT_KEYS) {
      (this as Record<keyof ArticleDbRowContent, unknown>)[key] = params[key];
    }

    return result;
  }

  setTags(tags: string[]): Promise<void> {
    return this.dba.setArticleTags(this.uid, tags);
  }

  getTags(): Promise<readonly string[]> {
    return this.dba.getArticleTags(this.uid);
  }

  getAttachmentIds(): Promise<UUID[]> {
    return this.dba.getArticleAttachmentIds(this.uid);
  }

  async setPost(postId: UUID | null): Promise<boolean> {
    const result = await this.dba.setArticlePost(this.uid, postId);

    if (!result) {
      return false;
    }

    this.postId = postId;

    return true;
  }

  async deactivate(): Promise<boolean> {
    const result = await this.dba.deactivateArticle(this.uid);

    if (!result) {
      return false;
    }

    this.toDelete = true;
    await scheduleArticleDeletion(this.uid);

    return true;
  }

  async activate(): Promise<boolean> {
    const result = await this.dba.activateArticle(this.uid);

    if (!result) {
      return false;
    }

    this.toDelete = false;

    return true;
  }

  /**
   * An article still exists in the database, but is treated as deleted in any way.
   * It can be restored in the future.
   */
  async isDeleting(): Promise<boolean> {
    if (this.toDelete) {
      return true;
    }

    const author = await this.dba.getUserById(this.authorId);
    return !author?.isActive;
  }

  async isVisibleFor(
    viewer: User | null,
  ): Promise<'VISIBLE' | 'DENIED' | 'LOGIN_REQUIRED' | 'NOT_FOUND'> {
    if (await this.isDeleting()) {
      return 'NOT_FOUND';
    }

    // If the viewer is the author of the article, he/she can always see it
    if (viewer?.id === this.authorId) {
      return 'VISIBLE';
    }

    // Otherwise, the article must be associated with a post and the viewer must have access to it
    const post = this.postId ? await this.dba.getPostById(this.postId) : null;

    if (!post) {
      return 'DENIED';
    }

    const isVisible = await post.isVisibleFor(viewer);

    if (!isVisible) {
      if (!viewer && post.isProtected === '1' && post.isPrivate === '0') {
        return 'LOGIN_REQUIRED';
      }

      return 'DENIED';
    }

    return 'VISIBLE';
  }

  destroy(): Promise<boolean> {
    return this.dba.destroyArticle(this.uid);
  }

  getRevisions(limit: number, offset: number, descOrder = true) {
    return this.dba.getArticleRevisions(this.uid, limit, offset, descOrder);
  }

  getShortId(): Promise<string> {
    return this.dba.getArticleShortId(this.uid);
  }
}

export type ArticleCreationParams = {
  author_id: UUID;
} & ArticleDbRowContent;

export type ArticleDbRow = {
  uid: UUID;
  author_id: UUID;
  post_id: UUID | null;
  created_at: Date;
  updated_at: Date;
  version: number;
  to_delete: boolean;
} & ArticleDbRowContent;

// Revisions of articles

export class ArticleRevision extends ArticleContent {
  uid: UUID;
  articleId: UUID;
  createdAt: Date;
  version: number;

  constructor(dba: DbAdapter, dbRow: ArticleRevisionDbRow) {
    super(dba, dbRow);
    this.uid = dbRow.uid;
    this.articleId = dbRow.article_id;
    this.createdAt = dbRow.created_at;
    this.version = dbRow.version;
  }
}

export type ArticleRevisionDbRow = {
  uid: UUID;
  article_id: UUID;
  created_at: Date;
  version: number;
} & ArticleDbRowContent;
