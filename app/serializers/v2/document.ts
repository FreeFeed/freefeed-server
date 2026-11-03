import { type Document } from '../../models';
import { type ISO8601DateTimeString, type UUID } from '../../support/types';

type SerializedDocument = {
  id: UUID;
  title: string;
  slug: string;
  body?: string;
  parentId: UUID | null;
  isPublished: boolean;
  visibility: string;
  tags: string[];
  createdBy: UUID;
  createdByUsername?: string;
  createdAt: ISO8601DateTimeString;
  updatedAt: ISO8601DateTimeString;
  url: string;
  documentsUrl: string;
};

export function serializeDocument(doc: Document, includeBody = false, username?: string): SerializedDocument {
  const result: SerializedDocument = {
    id: doc.id,
    title: doc.title,
    slug: doc.slug,
    parentId: doc.parentId,
    isPublished: doc.isPublished,
    visibility: doc.visibility || 'public',
    tags: doc.tags || [],
    createdBy: doc.userId,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : String(doc.updatedAt),
    url: doc.url,
    documentsUrl: `/documents/${username || ''}/${doc.slug}`,
  };

  if (username) {
    result.createdByUsername = username;
  }

  if (includeBody) {
    result.body = doc.body;
  }

  return result;
}
