import type { DbAdapter } from '../support/DbAdapter';
import type { UUID } from '../support/types';
import { scheduleArticleDeletion } from '../jobs/delete-article';
import { PubSub as pubSub } from '../models';
import type { User } from '../models';
import { EventService } from '../support/EventService';

import { extractTitle } from './article-body';
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

export type ArticleEditableContent = Pick<ArticleDbRowContent, 'digest' | 'body'>;

export type ArticleUpdateResult =
  | { status: 'updated'; version: number }
  | { status: 'conflict' }
  | { status: 'not-found' }
  | { status: 'unchanged' };

export class Article extends ArticleContent {
  id: UUID;
  authorId: UUID;
  postId: UUID | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  toDelete: boolean;

  constructor(dba: DbAdapter, dbRow: ArticleDbRow) {
    super(dba, dbRow);

    this.id = dbRow.uid;
    this.authorId = dbRow.author_id;
    this.postId = dbRow.post_id;
    this.toDelete = dbRow.to_delete;
    this.createdAt = dbRow.created_at;
    this.updatedAt = dbRow.updated_at;
    this.version = dbRow.version;
  }

  async update(
    expectedVersion: number,
    params: ArticleEditableContent,
    tags?: string[],
  ): Promise<ArticleUpdateResult> {
    const previousTitle = this.title;
    const previousDigest = this.digest;
    const result = await this.dba.updateArticle(this.id, expectedVersion, params);

    if (result.status === 'conflict' || result.status === 'not-found') {
      return result;
    }

    const normalizedTags = tags ? [...new Set(tags.map((tag) => tag.toLowerCase()))] : null;
    const currentTags = normalizedTags ? await this.getTags() : null;
    const tagsChanged =
      normalizedTags !== null &&
      currentTags !== null &&
      (currentTags.length !== normalizedTags.length ||
        currentTags.some((tag, index) => tag !== normalizedTags[index]));

    if (tagsChanged) {
      await this.setTags(normalizedTags);
    }

    if (result.status === 'updated') {
      this.version = result.version;
      this.title = extractTitle(params.body);
      this.digest = params.digest;
      this.body = params.body;

      await EventService.onArticlePublished(this.id);

      if (this.postId && (this.title !== previousTitle || this.digest !== previousDigest)) {
        await pubSub.updatePost(this.postId);
      }
    }

    if (result.status === 'updated' || tagsChanged) {
      await pubSub.updateArticle(this.id);
    }

    return result;
  }

  setTags(tags: string[]): Promise<void> {
    return this.dba.setArticleTags(this.id, tags);
  }

  getTags(): Promise<readonly string[]> {
    return this.dba.getArticleTags(this.id);
  }

  async setPost(postId: UUID | null): Promise<boolean> {
    const previousPostId = this.postId;
    const result = await this.dba.setArticlePost(this.id, postId);

    if (!result) {
      return false;
    }

    this.postId = postId;

    if (previousPostId !== postId) {
      const updatedPostId = postId ?? previousPostId;

      if (updatedPostId) {
        await pubSub.updatePost(updatedPostId);
      }

      if (postId === null && previousPostId) {
        await pubSub.destroyArticle(this.id, this.authorId, previousPostId, true);
      }

      await pubSub.updateArticle(this.id);
    }

    if (postId) {
      await EventService.onArticlePublished(this.id);
    }

    return true;
  }

  async deactivate(): Promise<boolean> {
    const result = await this.dba.deactivateArticle(this.id);

    if (!result) {
      return false;
    }

    this.toDelete = true;
    await scheduleArticleDeletion(this.id);
    await pubSub.destroyArticle(this.id, this.authorId, this.postId);

    return true;
  }

  async activate(): Promise<boolean> {
    const result = await this.dba.activateArticle(this.id);

    if (!result) {
      return false;
    }

    this.toDelete = false;
    await pubSub.restoreArticle(this.id);

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
    return this.dba.destroyArticle(this.id);
  }

  getRevisions(limit: number, offset: number, descOrder = true) {
    return this.dba.getArticleRevisions(this.id, limit, offset, descOrder);
  }

  getShortId(): Promise<string> {
    return this.dba.getArticleShortId(this.id);
  }
}

export type ArticleCreationParams = {
  author_id: UUID;
} & ArticleEditableContent;

export type ArticleDbRow = {
  uid: UUID;
  author_id: UUID;
  post_id: UUID | null;
  created_at: Date;
  updated_at: Date;
  version: number;
  to_delete: boolean;
} & ArticleDbRowContent;

export type ArticleSummaryData = {
  uid: UUID;
  authorId: UUID;
  postId: UUID | null;
  shortId: string;
  version: number;
  title: string;
  digest: string;
  createdAt: Date;
  updatedAt: Date;
  tags: readonly string[];
};

// Revisions of articles

export class ArticleRevision {
  title: string;
  body: ArticleBody;
  uid: UUID;
  articleId: UUID;
  createdAt: Date;
  version: number;

  constructor(dbRow: ArticleRevisionDbRow) {
    this.title = dbRow.title;
    this.body = dbRow.body;
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
  title: string;
  body: ArticleBody;
};
