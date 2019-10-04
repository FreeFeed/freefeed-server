/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected'

import cleanDB from '../dbCleaner';
import { dbAdapter } from '../../app/models';

import { createTestUsers, performRequest } from './functional_test_helper';
import { extAuthProfilesResponse } from './schemaV2-helper';


describe('ExtAuthController', () => {
  let luna;
  let lunaToken, marsToken;
  let lunaProfile1, lunaProfile2;

  before(async () => {
    await cleanDB($pg_database);

    await Promise.all((await createTestUsers(2)).map(async ({ authToken, user }, i) => {
      if (i === 0) {
        lunaToken = authToken;
        luna = await dbAdapter.getUserById(user.id);
      } else {
        marsToken = authToken;
      }
    }));

    lunaProfile1 = await luna.addOrUpdateExtProfile({ provider: 'facebook', externalId: '111', title: 'Luna Lovegood' });
    lunaProfile2 = await luna.addOrUpdateExtProfile({ provider: 'facebook', externalId: '112', title: 'Luna Maximoff' });
  });

  it('should not return profile list to anonymous', async () => {
    const result = await request('GET', '/v2/ext-auth/profiles', null);
    expect(result, 'to satisfy', { __httpStatus: 401 });
  });

  it('should return Luna profile list', async () => {
    const result = await request('GET', '/v2/ext-auth/profiles', null, { 'Authorization': `Bearer ${lunaToken}` });
    expect(result, 'to satisfy', extAuthProfilesResponse);
    expect(result, 'to satisfy', { profiles: [{ id: lunaProfile2.id }, { id: lunaProfile1.id }] });
  });

  it('should not allow to Mars to remove Luna profile', async () => {
    const result = await request('DELETE', `/v2/ext-auth/profiles/${lunaProfile1.id}`, {}, { 'Authorization': `Bearer ${marsToken}` });
    expect(result, 'to satisfy', { __httpStatus: 404 });
  });

  it('should allow to Luna to remove her profile', async () => {
    const result = await request('DELETE', `/v2/ext-auth/profiles/${lunaProfile1.id}`, {}, { 'Authorization': `Bearer ${lunaToken}` });
    expect(result, 'to satisfy', { __httpStatus: 200 });
  });

  it('should return modified Luna profile list', async () => {
    const result = await request('GET', '/v2/ext-auth/profiles', null, { 'Authorization': `Bearer ${lunaToken}` });
    expect(result, 'to satisfy', { profiles: [{ id: lunaProfile2.id }] });
  });
});

async function request(method, path, body, headers = {}) {
  const resp = await performRequest(path, {
    method,
    body:    method === 'GET' ? null : JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
  const textResponse =  await resp.text();
  let json;

  try {
    json = JSON.parse(textResponse);
  } catch (e) {
    json = {
      err: `invalid JSON: ${e.message}`,
      textResponse,
    };
  }

  json.__httpStatus = resp.status;
  return json;
}
