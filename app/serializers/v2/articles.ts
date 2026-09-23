import type { Article } from '../../models/article';
import type { ArticleBody } from '../../models/article-body';
import type { UUID } from '../../support/types';

export type SerializedArticleFull = {
  id: UUID;
  authorId: UUID;
  postId: UUID | null;
  shortId: string;
  version: number;
  title: string;
  digest: string;
  body: ArticleBody;
  createdAt: string;
  updatedAt: string;
  tags: readonly string[];
  attachmentIds: UUID[];
};

export async function serializeArticleFull(article: Article): Promise<SerializedArticleFull> {
  return {
    id: article.uid,
    authorId: article.authorId,
    postId: article.postId,
    shortId: await article.getShortId(),
    version: article.version,
    title: article.title,
    digest: article.digest,
    body: article.body,
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString(),
    tags: await article.getTags(),
    attachmentIds: await article.getAttachmentIds(),
  };
}
