import { z } from 'zod';

import type { DbAdapter } from '../support/DbAdapter';
import type { UUID } from '../support/types';
import { scheduleArticleDeletion } from '../jobs/delete-article';

const articleBlockSchema = z
  .object({
    // All blocks must have an ID
    id: z.string(),
  })
  .and(
    // Discriminated union for different block types
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('test'), content: z.string() }),
      // ...other block types can be added here
    ]),
  );

export const articleBodySchema = z.object({
  blocks: z.array(articleBlockSchema),
});

export type ArticleBody = z.infer<typeof articleBodySchema>;

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
