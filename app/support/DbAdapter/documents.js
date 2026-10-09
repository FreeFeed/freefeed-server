import { Document } from '../../models';

import { initObject, prepareModelPayload } from './utils';

const DOCUMENT_COLUMNS = {
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  userId: 'user_id',
  title: 'title',
  slug: 'slug',
  body: 'body',
  parentId: 'parent_id',
  isPublished: 'is_published',
  visibility: 'visibility',
};

const DOCUMENT_COLUMNS_MAPPING = {
  createdAt: (timestamp) => (timestamp instanceof Date ? timestamp.toISOString() : timestamp),
  updatedAt: (timestamp) => (timestamp instanceof Date ? timestamp.toISOString() : timestamp),
};

const DOCUMENT_FIELDS = {
  uid: 'id',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  user_id: 'userId',
  title: 'title',
  slug: 'slug',
  body: 'body',
  parent_id: 'parentId',
  is_published: 'isPublished',
  visibility: 'visibility',
};

const DOCUMENT_FIELDS_MAPPING = {
  created_at: (val) => (typeof val === 'string' ? new Date(val) : val),
  updated_at: (val) => (typeof val === 'string' ? new Date(val) : val),
};

function initDocumentObject(attrs) {
  if (!attrs) {
    return null;
  }

  attrs = prepareModelPayload(attrs, DOCUMENT_FIELDS, DOCUMENT_FIELDS_MAPPING);
  return initObject(Document, attrs, attrs.id);
}

const documentsTrait = (superClass) =>
  class extends superClass {
    async createDocument(payload) {
      const preparedPayload = prepareModelPayload(
        payload,
        DOCUMENT_COLUMNS,
        DOCUMENT_COLUMNS_MAPPING,
      );
      const [row] = await this.database('documents')
        .insert(preparedPayload)
        .returning('*');
      return row.uid;
    }

    async getDocumentById(id) {
      const row = await this.database.getRow('select * from documents where uid = :id', { id });
      const doc = initDocumentObject(row);

      if (doc) {
        doc.tags = await this.getDocumentTags(id);
      }

      return doc;
    }

    async getDocumentBySlug(slug) {
      const row = await this.database.getRow('select * from documents where slug = :slug', {
        slug,
      });
      const doc = initDocumentObject(row);

      if (doc) {
        doc.tags = await this.getDocumentTags(doc.id);
      }

      return doc;
    }

    async getDocumentByUserAndSlug(userId, slug) {
      const row = await this.database.getRow(
        'select * from documents where user_id = :userId and slug = :slug',
        { userId, slug },
      );
      const doc = initDocumentObject(row);

      if (doc) {
        doc.tags = await this.getDocumentTags(doc.id);
      }

      return doc;
    }

    async getDocumentsByUser(userId, { limit = 50, offset = 0 } = {}) {
      const rows = await this.database.getAll(
        `select * from documents where user_id = :userId
         order by updated_at desc limit :limit offset :offset`,
        { userId, limit, offset },
      );
      const docs = rows.map(initDocumentObject);

      // Attach tags in batch
      if (docs.length > 0) {
        const ids = docs.map((d) => d.id);
        const tags = await this.getDocumentsTags(ids);

        for (const doc of docs) {
          doc.tags = tags.get(doc.id) || [];
        }
      }

      return docs;
    }

    async updateDocument(id, payload) {
      const preparedPayload = prepareModelPayload(
        payload,
        DOCUMENT_COLUMNS,
        DOCUMENT_COLUMNS_MAPPING,
      );
      const [row] = await this.database('documents')
        .where('uid', id)
        .update(preparedPayload)
        .returning('*');
      const doc = initDocumentObject(row);

      if (doc) {
        doc.tags = await this.getDocumentTags(id);
      }

      return doc;
    }

    async deleteDocument(id) {
      await this.database.raw('delete from documents where uid = ?', id);
    }

    async addDocumentTag(documentId, tag) {
      await this.database.raw(
        'insert into document_tags (document_id, tag) values (:documentId, :tag) on conflict do nothing',
        { documentId, tag },
      );
    }

    async removeDocumentTag(documentId, tag) {
      await this.database.raw(
        'delete from document_tags where document_id = :documentId and tag = :tag',
        { documentId, tag },
      );
    }

    async getDocumentTags(documentId) {
      const rows = await this.database.getAll(
        'select tag from document_tags where document_id = :documentId order by tag',
        { documentId },
      );
      return rows.map((r) => r.tag);
    }

    async getDocumentsTags(documentIds) {
      if (documentIds.length === 0) {
        return new Map();
      }

      const rows = await this.database.getAll(
        `select document_id, tag from document_tags
         where document_id in (${documentIds.map(() => '?').join(',')})
         order by tag`,
        documentIds,
      );

      const map = new Map();

      for (const row of rows) {
        if (!map.has(row.document_id)) {
          map.set(row.document_id, []);
        }

        map.get(row.document_id).push(row.tag);
      }

      return map;
    }

    async ensureUniqueDocumentSlug(baseSlug, userId) {
      let slug = baseSlug;
      let counter = 1;

      // eslint-disable-next-line no-await-in-loop
      while (await this.database.getOne('select 1 from documents where user_id = :userId and slug = :slug', { userId, slug })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      return slug;
    }

    async getDocumentChildren(parentId) {
      const rows = await this.database.getAll(
        `select * from documents where parent_id = :parentId
         order by title`,
        { parentId },
      );
      return rows.map(initDocumentObject);
    }

    async getUserDocumentTags(userId) {
      const rows = await this.database.getAll(
        `select dt.tag, count(*)::int as count
         from document_tags dt
         join documents d on d.uid = dt.document_id
         where d.user_id = :userId
         group by dt.tag
         order by count desc, dt.tag`,
        { userId },
      );
      return rows;
    }

    async countUserDocuments(userId) {
      return await this.database.getOne(
        'select count(*)::int from documents where user_id = :userId',
        { userId },
      );
    }
  };

export default documentsTrait;
