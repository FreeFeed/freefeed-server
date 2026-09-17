import type { DbAdapter } from '../support/DbAdapter';
import type { UUID } from '../support/types';

export type ArticleBlock = { type: 'test'; content: string };
export type ArticleBody = { blocks: ArticleBlock[] };

abstract class ArticleContent {
  protected readonly dba: DbAdapter;

  title: string;
  slug: string;
  digest: string;
  body: ArticleBody;

  constructor(dba: DbAdapter, dbRow: ArticleDbRowContent) {
    this.dba = dba;
    this.title = dbRow.title;
    this.slug = dbRow.slug;
    this.digest = dbRow.digest;
    this.body = dbRow.body;
  }
}

export type ArticleDbRowContent = {
  title: string;
  slug: string;
  digest: string;
  body: ArticleBody;
};

export const ARTICLE_CONTENT_KEYS = [
  'title',
  'slug',
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

  constructor(dba: DbAdapter, dbRow: ArticleDbRow) {
    super(dba, dbRow);

    this.uid = dbRow.uid;
    this.authorId = dbRow.author_id;
    this.postId = dbRow.post_id;
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
