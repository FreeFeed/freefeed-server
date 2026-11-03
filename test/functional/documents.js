/* global $pg_database */
import unexpected from 'unexpected';

import cleanDB from '../dbCleaner';

import { createTestUser, performJSONRequest } from './functional_test_helper';

const expect = unexpected.clone();

describe('Documents', () => {
  let luna, zloy;

  before(async () => {
    await cleanDB($pg_database);
    luna = await createTestUser('luna');
    zloy = await createTestUser('zloy');
  });

  describe('CRUD', () => {
    it('should not create document anonymously', async () => {
      const resp = await performJSONRequest('POST', '/v5/documents', { title: 'Test' });
      expect(resp, 'to satisfy', { __httpCode: 401 });
    });

    it('should create a document', async () => {
      const resp = await performJSONRequest(
        'POST',
        '/v5/documents',
        {
          title: 'My First Doc',
          body: '# Hello\n\nThis is **markdown** content.',
          tags: ['guide', 'intro'],
        },
        { Authorization: `Bearer ${luna.authToken}` },
      );

      expect(resp, 'to satisfy', {
        __httpCode: 201,
        documents: {
          title: 'My First Doc',
          slug: 'my-first-doc',
          tags: ['guide', 'intro'],
          parentId: null,
          isPublished: true,
        },
      });

      expect(resp.documents.id, 'to be a', 'string');
      expect(resp.documents.body, 'to be', '# Hello\n\nThis is **markdown** content.');
    });

    it('should list documents', async () => {
      const resp = await performJSONRequest('GET', '/v5/documents', undefined, {
        Authorization: `Bearer ${luna.authToken}`,
      });

      expect(resp, 'to satisfy', {
        __httpCode: 200,
        documents: [{ title: 'My First Doc' }],
        total: 1,
      });

      // List should not include body by default
      expect(resp.documents[0].body, 'to be undefined');
    });

    it('should get document by id', async () => {
      // First get the id from list
      const listResp = await performJSONRequest('GET', '/v5/documents', undefined, {
        Authorization: `Bearer ${luna.authToken}`,
      });
      const docId = listResp.documents[0].id;

      const resp = await performJSONRequest('GET', `/v5/documents/${docId}`, undefined, {
        Authorization: `Bearer ${luna.authToken}`,
      });

      expect(resp, 'to satisfy', {
        __httpCode: 200,
        documents: {
          id: docId,
          title: 'My First Doc',
          body: '# Hello\n\nThis is **markdown** content.',
        },
      });
    });

    it('should return 404 for other user`s document', async () => {
      const listResp = await performJSONRequest('GET', '/v5/documents', undefined, {
        Authorization: `Bearer ${luna.authToken}`,
      });
      const docId = listResp.documents[0].id;

      const resp = await performJSONRequest('GET', `/v5/documents/${docId}`, undefined, {
        Authorization: `Bearer ${zloy.authToken}`,
      });

      expect(resp, 'to satisfy', { __httpCode: 404 });
    });

    it('should update document', async () => {
      const listResp = await performJSONRequest('GET', '/v5/documents', undefined, {
        Authorization: `Bearer ${luna.authToken}`,
      });
      const docId = listResp.documents[0].id;

      const resp = await performJSONRequest(
        'PUT',
        `/v5/documents/${docId}`,
        {
          title: 'Updated Title',
          body: '# Updated\n\nNew content.',
          tags: ['guide', 'updated'],
        },
        { Authorization: `Bearer ${luna.authToken}` },
      );

      expect(resp, 'to satisfy', {
        __httpCode: 200,
        documents: {
          title: 'Updated Title',
          body: '# Updated\n\nNew content.',
          tags: ['guide', 'updated'],
        },
      });
    });

    it('should delete document', async () => {
      // Create a doc to delete
      const createResp = await performJSONRequest(
        'POST',
        '/v5/documents',
        { title: 'To Delete' },
        { Authorization: `Bearer ${luna.authToken}` },
      );
      const docId = createResp.documents.id;

      const deleteResp = await performJSONRequest('DELETE', `/v5/documents/${docId}`, undefined, {
        Authorization: `Bearer ${luna.authToken}`,
      });

      expect(deleteResp, 'to satisfy', { __httpCode: 200 });

      // Verify it's gone
      const getResp = await performJSONRequest('GET', `/v5/documents/${docId}`, undefined, {
        Authorization: `Bearer ${luna.authToken}`,
      });
      expect(getResp, 'to satisfy', { __httpCode: 404 });
    });
  });

  describe('Slugs', () => {
    it('should auto-generate slug from title', async () => {
      const resp = await performJSONRequest(
        'POST',
        '/v5/documents',
        { title: 'A Guide to Freefeed' },
        { Authorization: `Bearer ${luna.authToken}` },
      );

      expect(resp, 'to satisfy', {
        documents: { slug: 'a-guide-to-freefeed' },
      });

      // Clean up
      const docId = resp.documents.id;
      await performJSONRequest('DELETE', `/v5/documents/${docId}`, undefined, {
        Authorization: `Bearer ${luna.authToken}`,
      });
    });

    it('should accept custom slug', async () => {
      const resp = await performJSONRequest(
        'POST',
        '/v5/documents',
        { title: 'My Doc', slug: 'custom-url-path' },
        { Authorization: `Bearer ${luna.authToken}` },
      );

      expect(resp, 'to satisfy', {
        documents: { slug: 'custom-url-path' },
      });

      // Clean up
      const docId = resp.documents.id;
      await performJSONRequest('DELETE', `/v5/documents/${docId}`, undefined, {
        Authorization: `Bearer ${luna.authToken}`,
      });
    });

    it('should make unique slug on conflict', async () => {
      const resp1 = await performJSONRequest(
        'POST',
        '/v5/documents',
        { title: 'My Document', slug: 'duplicate-slug' },
        { Authorization: `Bearer ${luna.authToken}` },
      );

      expect(resp1, 'to satisfy', { __httpCode: 201, documents: { slug: 'duplicate-slug' } });

      const resp2 = await performJSONRequest(
        'POST',
        '/v5/documents',
        { title: 'My Document', slug: 'duplicate-slug' },
        { Authorization: `Bearer ${luna.authToken}` },
      );

      expect(resp2, 'to satisfy', { __httpCode: 201, documents: { slug: 'duplicate-slug-1' } });

      // Clean up
      const ids = [resp1.documents.id, resp2.documents.id];
      await Promise.all(
        ids.map((id) =>
          performJSONRequest('DELETE', `/v5/documents/${id}`, undefined, {
            Authorization: `Bearer ${luna.authToken}`,
          }),
        ),
      );
    });
  });

  describe('Tags', () => {
    let docId;

    before(async () => {
      await cleanDB($pg_database);
      luna = await createTestUser('luna');

      const resp = await performJSONRequest(
        'POST',
        '/v5/documents',
        { title: 'Tagged Doc', tags: ['alpha', 'beta'] },
        { Authorization: `Bearer ${luna.authToken}` },
      );
      docId = resp.documents.id;
    });

    it('should include tags in document', async () => {
      const resp = await performJSONRequest('GET', `/v5/documents/${docId}`, undefined, {
        Authorization: `Bearer ${luna.authToken}`,
      });

      expect(resp, 'to satisfy', {
        documents: {
          tags: ['alpha', 'beta'],
        },
      });
    });

    it('should list user tags with counts', async () => {
      const resp = await performJSONRequest('GET', '/v5/documents/tree', undefined, {
        Authorization: `Bearer ${luna.authToken}`,
      });

      expect(resp, 'to satisfy', {
        tags: [{ tag: 'alpha' }, { tag: 'beta' }],
      });
    });

    after(async () => {
      await performJSONRequest('DELETE', `/v5/documents/${docId}`, undefined, {
        Authorization: `Bearer ${luna.authToken}`,
      });
    });
  });

  describe('Hierarchy', () => {
    let parentId;

    before(async () => {
      await cleanDB($pg_database);
      luna = await createTestUser('luna');

      const parentResp = await performJSONRequest(
        'POST',
        '/v5/documents',
        { title: 'Parent Doc' },
        { Authorization: `Bearer ${luna.authToken}` },
      );
      parentId = parentResp.documents.id;

      // Create child
      await performJSONRequest(
        'POST',
        '/v5/documents',
        { title: 'Child Doc', parentId },
        { Authorization: `Bearer ${luna.authToken}` },
      );

      // Create another child
      await performJSONRequest(
        'POST',
        '/v5/documents',
        { title: 'Another Child', parentId },
        { Authorization: `Bearer ${luna.authToken}` },
      );
    });

    it('should return tree structure', async () => {
      const resp = await performJSONRequest('GET', '/v5/documents/tree', undefined, {
        Authorization: `Bearer ${luna.authToken}`,
      });

      expect(resp, 'to satisfy', {
        tree: [
          {
            title: 'Parent Doc',
            children: [
              { title: 'Another Child', children: [] },
              { title: 'Child Doc', children: [] },
            ],
          },
        ],
      });
    });

    after(async () => {
      // Clean up children first (they get deleted cascading through the route)
      const treeResp = await performJSONRequest('GET', '/v5/documents/tree', undefined, {
        Authorization: `Bearer ${luna.authToken}`,
      });

      const deletePromises = [];

      for (const node of treeResp.tree) {
        for (const child of node.children) {
          deletePromises.push(
            performJSONRequest('DELETE', `/v5/documents/${child.id}`, undefined, {
              Authorization: `Bearer ${luna.authToken}`,
            }),
          );
        }

        deletePromises.push(
          performJSONRequest('DELETE', `/v5/documents/${node.id}`, undefined, {
            Authorization: `Bearer ${luna.authToken}`,
          }),
        );
      }

      await Promise.all(deletePromises);
    });
  });

  describe('Public URL (/docs/:slug)', () => {
    it('should serve document by slug', async () => {
      const resp = await performJSONRequest(
        'POST',
        '/v5/documents',
        {
          title: 'Public Doc',
          slug: 'public-doc',
          body: '# Public\n\nVisible to anyone.',
          isPublished: true,
        },
        { Authorization: `Bearer ${luna.authToken}` },
      );
      const rawId = resp.documents.id;

      const publicResp = await performJSONRequest('GET', '/docs/public-doc');
      expect(publicResp, 'to satisfy', {
        __httpCode: 200,
        documents: {
          slug: 'public-doc',
          title: 'Public Doc',
          body: '# Public\n\nVisible to anyone.',
        },
      });

      // Clean up
      await performJSONRequest('DELETE', `/v5/documents/${rawId}`, undefined, {
        Authorization: `Bearer ${luna.authToken}`,
      });
    });

    it('should return 404 for unpublished document', async () => {
      const resp = await performJSONRequest(
        'POST',
        '/v5/documents',
        { title: 'Draft', slug: 'draft-doc', isPublished: false },
        { Authorization: `Bearer ${luna.authToken}` },
      );
      const rawId = resp.documents.id;

      const publicResp = await performJSONRequest('GET', '/docs/draft-doc');
      expect(publicResp, 'to satisfy', { __httpCode: 404 });

      // Clean up
      await performJSONRequest('DELETE', `/v5/documents/${rawId}`, undefined, {
        Authorization: `Bearer ${luna.authToken}`,
      });
    });

    it('should return 404 for non-existent slug', async () => {
      const resp = await performJSONRequest('GET', '/docs/non-existent-slug');
      expect(resp, 'to satisfy', { __httpCode: 404 });
    });
  });
});
