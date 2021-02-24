/* eslint-env node, mocha */
/* global $pg_database */
import fs from 'fs';
import path from 'path';

import FormData from 'form-data';
import expect from 'unexpected';

import cleanDB from '../dbCleaner';

import { createTestUser, performJSONRequest, authHeaders } from './functional_test_helper';

describe('Attachments', () => {
  let luna;
  before(async () => {
    await cleanDB($pg_database);
    luna = await createTestUser('luna');
  });

  it(`should not create attachment anonymously`, async () => {
    const data = new FormData();
    data.append('file', Buffer.from('this is a test'), {
      filename: 'test.txt',
      contentType: 'text/plain',
    });
    const resp = await performJSONRequest('POST', '/v1/attachments', data);
    expect(resp, 'to satisfy', { __httpCode: 401 });
  });

  it(`should return error if no file is provided`, async () => {
    const data = new FormData();
    const resp = await performJSONRequest('POST', '/v1/attachments', data, authHeaders(luna));
    expect(resp, 'to satisfy', { __httpCode: 400 });
  });

  it(`should create text attachment`, async () => {
    const data = new FormData();
    data.append('file', Buffer.from('this is a test'), {
      filename: 'test.txt',
      contentType: 'text/plain',
    });
    const resp = await performJSONRequest('POST', '/v1/attachments', data, authHeaders(luna));
    expect(resp, 'to satisfy', {
      attachments: {
        fileName: 'test.txt',
        mediaType: 'general',
        fileSize: 'this is a test'.length,
      },
      users: [{ id: luna.user.id }],
    });
  });

  it(`should create image attachment`, async () => {
    const filePath = path.join(__dirname, '../fixtures/test-image.150x150.png');
    const data = new FormData();
    data.append('file', fs.createReadStream(filePath));
    const resp = await performJSONRequest('POST', '/v1/attachments', data, authHeaders(luna));
    expect(resp, 'to satisfy', {
      attachments: {
        fileName: 'test-image.150x150.png',
        mediaType: 'image',
        fileSize: fs.statSync(filePath).size,
      },
      users: [{ id: luna.user.id }],
    });
  });

  it(`should create attachment from any binary form field`, async () => {
    const data = new FormData();
    data.append('name', 'john');
    data.append('attachment[a42]', Buffer.from('this is a test'), {
      filename: 'test.txt',
      contentType: 'text/plain',
    });
    const resp = await performJSONRequest('POST', '/v1/attachments', data, authHeaders(luna));
    expect(resp, 'to satisfy', {
      attachments: {
        fileName: 'test.txt',
        mediaType: 'general',
        fileSize: 'this is a test'.length,
      },
      users: [{ id: luna.user.id }],
    });
  });
});
