import createDebug from 'debug';
import compose from 'koa-compose';

import { serializeDocument } from '../../../serializers/v2/document';
import { serializeUsersByIds } from '../../../serializers/v2/user';
import {
  reportError,
  NotFoundException,
  ValidationException,
} from '../../../support/exceptions';
import { authRequired } from '../../middlewares';
import { dbAdapter, Document } from '../../../models';

const debug = createDebug('freefeed:controller:documents');

export default class DocumentsController {
  app;

  constructor(app) {
    this.app = app;
    debug('DocumentsController created');
  }

  async _resolveUsername(userId) {
    if (!userId) return undefined;
    try {
      const user = await dbAdapter.getUserById(userId);
      return user?.username;
    } catch {
      return undefined;
    }
  }

  create = compose([
    authRequired(),
    async (ctx) => {
      const body = ctx.request.body;
      const { user } = ctx.state;

      if (!body.title || !body.title.trim()) {
        throw new ValidationException('Title is required');
      }

      if (body.title && body.title.length > 200) {
        throw new ValidationException('Title must not exceed 200 characters');
      }

      if (body.slug && body.slug.length > 200) {
        throw new ValidationException('Slug must not exceed 200 characters');
      }

      const visibility = ['public', 'protected', 'private'].includes(body.visibility) ? body.visibility : 'public';

      try {
        const slug = body.slug ? Document.slugify(body.slug) : undefined;
        const params = {
          title: body.title.trim(),
          slug,
          body: body.body || '',
          parentId: body.parentId || null,
          isPublished: body.isPublished !== false,
          visibility,
          tags: Array.isArray(body.tags) ? body.tags : [],
        };

        const doc = await Document.create(params, user);

        ctx.status = 201;
        ctx.body = {
          documents: serializeDocument(doc, true, user.username),
          users: await serializeUsersByIds([doc.userId], user.id),
        };
      } catch (e) {
        if (e.status === 409) {
          throw e;
        }
        reportError(ctx)(e);
      }
    },
  ]);

  list = compose([
    authRequired(),
    async (ctx) => {
      const { user } = ctx.state;
      const limit = Math.min(parseInt(ctx.query.limit) || 50, 100);
      const offset = parseInt(ctx.query.offset) || 0;

      const docs = await dbAdapter.getDocumentsByUser(user.id, { limit, offset });
      const total = await dbAdapter.countUserDocuments(user.id);

      ctx.body = {
        documents: docs.map((d) => serializeDocument(d, false, user.username)),
        total,
        limit,
        offset,
      };
    },
  ]);

  getById = compose([
    authRequired(),
    async (ctx) => {
      const { user } = ctx.state;
      const doc = await dbAdapter.getDocumentById(ctx.params.docId);

      if (!doc || doc.userId !== user.id) {
        throw new NotFoundException('Document not found');
      }

      ctx.body = {
        documents: serializeDocument(doc, true, user.username),
        users: await serializeUsersByIds([doc.userId], user.id),
      };
    },
  ]);
  update = compose([
    authRequired(),
    async (ctx) => {
      const { user } = ctx.state;
      const body = ctx.request.body;

      const doc = await dbAdapter.getDocumentById(ctx.params.docId);
      if (!doc || doc.userId !== user.id) {
        throw new NotFoundException('Document not found');
      }

      const updateParams = {};

      if (body.title !== undefined) {
        if (body.title.length > 200) {
          throw new ValidationException('Title must not exceed 200 characters');
        }
        updateParams.title = body.title.trim();
      }
      if (body.slug !== undefined) {
        if (body.slug.length > 200) {
          throw new ValidationException('Slug must not exceed 200 characters');
        }
        updateParams.slug = body.slug;
      }
      if (body.body !== undefined) {
        updateParams.body = body.body;
      }
      if (body.parentId !== undefined) {
        updateParams.parentId = body.parentId || null;
      }
      if (body.isPublished !== undefined) {
        updateParams.isPublished = body.isPublished;
      }
      if (body.visibility !== undefined && ['public', 'protected', 'private'].includes(body.visibility)) {
        updateParams.visibility = body.visibility;
      }
      if (body.tags !== undefined) {
        updateParams.tags = Array.isArray(body.tags) ? body.tags : [];
      }

      try {
        const updated = await doc.update(updateParams);
        ctx.body = {
          documents: serializeDocument(updated, true, user.username),
        };
      } catch (e) {
        if (e.status === 409) {
          throw e;
        }
        reportError(ctx)(e);
      }
    },
  ]);

  destroy = compose([
    authRequired(),
    async (ctx) => {
      const { user } = ctx.state;

      const doc = await dbAdapter.getDocumentById(ctx.params.docId);
      if (!doc || doc.userId !== user.id) {
        throw new NotFoundException('Document not found');
      }

      await doc.destroy();
      ctx.body = { success: true };
    },
  ]);

  tree = compose([
    authRequired(),
    async (ctx) => {
      const { user } = ctx.state;
      const docs = await dbAdapter.getDocumentsByUser(user.id);
      const tags = await dbAdapter.getUserDocumentTags(user.id);

      const childrenMap = new Map();

      for (const doc of docs) {
        const pid = doc.parentId || '';
        if (!childrenMap.has(pid)) {
          childrenMap.set(pid, []);
        }
        childrenMap.get(pid).push(doc);
      }

      function buildSubtree(parentId) {
        const items = childrenMap.get(parentId || '') || [];
        return items.map((doc) => ({
          id: doc.id,
          title: doc.title,
          slug: doc.slug,
          tags: doc.tags,
          children: buildSubtree(doc.id),
        }));
      }

      ctx.body = {
        tree: buildSubtree(null),
        tags,
      };
    },
  ]);

  getByUserAndSlug = async (ctx) => {    const { slug, username } = ctx.params;
    const viewerId = ctx.state.user?.id;
    let doc;

    if (username) {
      const user = await dbAdapter.getUserByUsername(username);
      if (!user) {
        throw new NotFoundException('Document not found');
      }
      doc = await dbAdapter.getDocumentByUserAndSlug(user.id, slug);
    } else {
      doc = await dbAdapter.getDocumentBySlug(slug);
    }

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    if (!doc.isPublished) {
      throw new NotFoundException('Document not found');
    }

    if (doc.visibility === 'private' && doc.userId !== viewerId) {
      throw new NotFoundException('Document not found');
    }
    if (doc.visibility === 'protected' && doc.userId !== viewerId) {
      throw new NotFoundException('Document not found');
    }

    const docUsername = username || await this._resolveUsername(doc.userId);

    ctx.body = {
      documents: serializeDocument(doc, true, docUsername),
    };
  };
}
