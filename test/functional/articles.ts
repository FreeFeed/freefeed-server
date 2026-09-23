import { beforeEach, describe, it } from 'mocha';
import expect from 'unexpected';

import { dbAdapter } from '../../app/models';
import type { UUID } from '../../app/support/types';
import cleanDB from '../dbCleaner';

import {
  authHeaders,
  createMockAttachmentAsync,
  createTestUser,
  performJSONRequest,
} from './functional_test_helper';
import type { UserCtx } from './functional_test_helper';

const content = {
  title: 'Test article',
  digest: 'Test digest',
  body: { blocks: [{ id: 'text', type: 'text', content: 'Hello' }] },
};

describe('Articles API', () => {
  let luna: UserCtx;

  beforeEach(async () => {
    await cleanDB(dbAdapter.database);
    luna = await createTestUser('luna');
  });

  it('should create and serialize an article with an attachment', async () => {
    const attachment = await createMockAttachmentAsync(luna);
    const articleContent = {
      ...content,
      body: {
        blocks: [
          ...content.body.blocks,
          { id: 'media', type: 'media', attachmentId: attachment.id },
        ],
      },
    };

    const response = await performJSONRequest(
      'POST',
      '/v4/articles',
      articleContent,
      authHeaders(luna),
    );

    expect(response, 'to satisfy', {
      __httpCode: 200,
      article: {
        id: expect.it('to be a string'),
        authorId: luna.user.id,
        postId: null,
        shortId: expect.it('to be a string'),
        version: 1,
        ...articleContent,
        createdAt: expect.it('to be a string'),
        updatedAt: expect.it('to be a string'),
        tags: [],
        attachmentIds: [attachment.id],
      },
      attachments: [{ id: attachment.id, createdBy: luna.user.id, postId: null }],
      users: [{ id: luna.user.id }],
    });

    const { id } = (response as typeof response & { article: { id: UUID } }).article;
    expect(await dbAdapter.getArticleById(id), 'to satisfy', {
      authorId: luna.user.id,
      version: 1,
      body: articleContent.body,
    });
    expect(await dbAdapter.getAttachmentById(attachment.id), 'to satisfy', { articleId: id });
  });

  it('should reject anonymous creation', async () => {
    const response = await performJSONRequest('POST', '/v4/articles', content);

    expect(response, 'to satisfy', { __httpCode: 401 });
    expect(await dbAdapter.database('articles'), 'to be empty');
  });

  it('should reject an invalid body', async () => {
    const response = await performJSONRequest(
      'POST',
      '/v4/articles',
      { ...content, body: { blocks: [{ id: 'bad', type: 'media', attachmentId: 'invalid' }] } },
      authHeaders(luna),
    );

    expect(response, 'to satisfy', { __httpCode: 422, err: /attachmentId/ });
    expect(await dbAdapter.database('articles'), 'to be empty');
  });

  it('should reject duplicate block IDs', async () => {
    const response = await performJSONRequest(
      'POST',
      '/v4/articles',
      {
        ...content,
        body: {
          blocks: [...content.body.blocks, { id: 'text', type: 'list', items: ['Other block'] }],
        },
      },
      authHeaders(luna),
    );

    expect(response, 'to satisfy', { __httpCode: 422, err: /Block IDs must be unique/ });
    expect(await dbAdapter.database('articles'), 'to be empty');
  });

  it('should reject a foreign attachment without linking own attachments', async () => {
    const mars = await createTestUser('mars');
    const own = await createMockAttachmentAsync(luna);
    const foreign = await createMockAttachmentAsync(mars);
    const response = await performJSONRequest(
      'POST',
      '/v4/articles',
      {
        ...content,
        body: {
          blocks: [own.id, foreign.id].map((attachmentId, index) => ({
            id: String(index),
            type: 'media',
            attachmentId,
          })),
        },
      },
      authHeaders(luna),
    );

    expect(response, 'to satisfy', {
      __httpCode: 422,
      err: 'Some article attachments are unavailable',
    });
    expect(await dbAdapter.database('articles'), 'to be empty');
    expect(await dbAdapter.getAttachmentById(own.id), 'to satisfy', { articleId: null });
  });
});
