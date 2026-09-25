import type { Article, ArticleRevision, ArticleSummaryData } from '../../models/article';
import { extractAttachmentIds } from '../../models/article-body';
import type { ArticleBody } from '../../models/article-body';
import type { UUID } from '../../support/types';

export type SerializedArticle = {
  id: UUID;
  authorId: UUID;
  postId: UUID | null;
  shortId: string;
  version: number;
  title: string;
  digest: string;
  createdAt: string;
  updatedAt: string;
  tags: readonly string[];
};

export type SerializedArticleFull = SerializedArticle & {
  body: ArticleBody;
  attachmentIds: UUID[];
};

export type SerializedArticleRevision = {
  id: UUID;
  createdAt: string;
};

export type SerializedArticleRevisionFull = SerializedArticleRevision & {
  articleId: UUID;
  version: number;
  title: string;
  digest: string;
  body: ArticleBody;
  attachmentIds: UUID[];
};

export function serializeArticle(article: ArticleSummaryData): SerializedArticle {
  return {
    id: article.uid,
    authorId: article.authorId,
    postId: article.postId,
    shortId: article.shortId,
    version: article.version,
    title: article.title,
    digest: article.digest,
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString(),
    tags: article.tags,
  };
}

export async function serializeArticleFull(article: Article): Promise<SerializedArticleFull> {
  const [shortId, tags, attachmentIds] = await Promise.all([
    article.getShortId(),
    article.getTags(),
    article.getAttachmentIds(),
  ]);

  return {
    ...serializeArticle({
      uid: article.id,
      authorId: article.authorId,
      postId: article.postId,
      shortId,
      version: article.version,
      title: article.title,
      digest: article.digest,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
      tags,
    }),
    body: article.body,
    attachmentIds,
  };
}

export function serializeArticleRevision(revision: ArticleRevision): SerializedArticleRevision {
  return {
    id: revision.uid,
    createdAt: revision.createdAt.toISOString(),
  };
}

export function serializeArticleRevisionFull(
  revision: ArticleRevision,
): SerializedArticleRevisionFull {
  return {
    ...serializeArticleRevision(revision),
    articleId: revision.articleId,
    version: revision.version,
    title: revision.title,
    digest: revision.digest,
    body: revision.body,
    attachmentIds: extractAttachmentIds(revision.body),
  };
}
