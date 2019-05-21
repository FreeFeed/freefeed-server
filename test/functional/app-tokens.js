/* eslint-env node, mocha */
/* global $database, $pg_database */
import expect from 'unexpected';

import cleanDB from '../dbCleaner';
import { getSingleton } from '../../app/app';
import { AppTokenV1, dbAdapter, PubSub } from '../../app/models';
import { appTokensScopes } from '../../app/models/app-tokens-scopes';
import { PubSubAdapter } from '../../app/support/PubSubAdapter';

import {
  performRequest,
  createTestUsers,
  createTestUser,
  goPrivate,
  createAndReturnPost,
  createCommentAsync,
  updateUserAsync,
  whoami,
} from './functional_test_helper';
import { UUID, appTokenInfo } from './schemaV2-helper';
import Session from './realtime-session';


describe('App tokens controller', () => {
  before(() => cleanDB($pg_database));

  describe('Luna and Mars creates tokens', () => {
    let luna, lunaToken;
    let mars, marsToken;
    before(async () => {
      [luna, mars] = await createTestUsers(2);
      lunaToken = new AppTokenV1({
        userId: luna.user.id,
        title:  'My app',
        scopes: ['read-my-info', 'manage-posts'],
      });
      marsToken = new AppTokenV1({
        userId: mars.user.id,
        title:  'My app',
        scopes: ['read-my-info', 'manage-posts'],
      });
      await Promise.all([lunaToken, marsToken].map((t) => t.create()));
    });

    it('should create token', async () => {
      const resp = await request(
        'POST', '/v2/app-tokens',
        {
          title:  'App1',
          scopes: ['read-my-info', 'manage-posts'],
        },
        { 'X-Authentication-Token': luna.authToken },
      );

      expect(resp, 'to satisfy', {
        token: {
          id:            expect.it('to satisfy', UUID),
          title:         'App1',
          issue:         1,
          scopes:        ['read-my-info', 'manage-posts'],
          lastUsedAt:    null,
          lastIP:        null,
          lastUserAgent: null,
        },
        tokenString: expect.it('to be a string'),
      });
    });

    it('should return "whoami" data with token', async () => {
      const resp = await request(
        'GET', '/v2/users/whoami',
        null,
        { 'X-Authentication-Token': lunaToken.tokenString() },
      );
      expect(resp, 'to satisfy', { users: { id: luna.user.id } });
    });

    it('should reject "/v1/users/:username" request with token', async () => {
      const resp = await request(
        'GET', `/v1/users/${luna.username}`,
        null,
        { 'X-Authentication-Token': lunaToken.tokenString() },
      );
      expect(resp, 'to have key', 'err');
    });

    describe('Invalidation', () => {
      after(async () => {
        await dbAdapter.updateAppToken(lunaToken.id, { isActive: true });
      });

      it('should invalidate token', async () => {
        const resp = await request(
          'DELETE', `/v2/app-tokens/${lunaToken.id}`,
          null,
          { 'X-Authentication-Token': luna.authToken },
        );
        expect(resp, 'to satisfy', { __httpStatus: 200 });
      });

      it('should invalidate invalidated token', async () => {
        const resp = await request(
          'DELETE', `/v2/app-tokens/${lunaToken.id}`,
          null,
          { 'X-Authentication-Token': luna.authToken },
        );
        expect(resp.__httpStatus, 'to be', 200);
      });

      it('should not invalidate token of another user', async () => {
        const resp = await request(
          'DELETE', `/v2/app-tokens/${marsToken.id}`,
          null,
          { 'X-Authentication-Token': luna.authToken },
        );
        expect(resp, 'to satisfy', { __httpStatus: 404 });
      });

      it('should reject "whoami" request with invalidated token', async () => {
        const resp = await request(
          'GET', '/v2/users/whoami',
          null,
          { 'X-Authentication-Token': lunaToken.tokenString() },
        );
        expect(resp, 'to satisfy', { __httpStatus: 403 });
      });
    });

    describe('Reissue', () => {
      let newLunaTokenString;

      after(async () => {
        await dbAdapter.updateAppToken(lunaToken.id, { isActive: true, issue: 1 });
      });

      it('should reissue token', async () => {
        const resp = await request(
          'POST', `/v2/app-tokens/${lunaToken.id}/reissue`,
          {},
          { 'X-Authentication-Token': luna.authToken },
        );
        expect(resp, 'to satisfy', {
          token: {
            ...appTokenInfo,
            id:    lunaToken.id,
            issue: 2, // <-- this
          },
          tokenString: expect.it('to be a string'),
        });

        newLunaTokenString = resp.tokenString;
      });

      it('should not reissue token of another user', async () => {
        const resp = await request(
          'POST', `/v2/app-tokens/${marsToken.id}/reissue`,
          {},
          { 'X-Authentication-Token': luna.authToken },
        );
        expect(resp, 'to satisfy', { __httpStatus: 404 });
      });

      it('should reissue token being auhtenticated by itself', async () => {
        const resp = await request(
          'POST', `/v2/app-tokens/${lunaToken.id}/reissue`,
          {},
          { 'X-Authentication-Token': newLunaTokenString },
        );
        expect(resp, 'to satisfy', {
          __httpStatus: 200,
          token:        { issue: 3 },
        });

        newLunaTokenString = resp.tokenString;
      });

      it('should not reissue token being auhtenticated by another app token', async () => {
        const newToken = new AppTokenV1({
          userId: luna.user.id,
          title:  'My app 2',
          scopes: ['read-my-info', 'manage-posts'],
        });
        await newToken.create();

        const resp = await request(
          'POST', `/v2/app-tokens/${lunaToken.id}/reissue`,
          {},
          { 'X-Authentication-Token': newToken.tokenString() },
        );
        expect(resp, 'to satisfy', { __httpStatus: 403 });
      });

      it('should not reissue inactivated token', async () => {
        await lunaToken.inactivate();

        const resp = await request(
          'POST', `/v2/app-tokens/${lunaToken.id}/reissue`,
          {},
          { 'X-Authentication-Token': luna.authToken },
        );
        expect(resp, 'to satisfy', { __httpStatus: 404 });
      });
    });

    describe('Title change', () => {
      after(async () => {
        await dbAdapter.updateAppToken(lunaToken.id, { isActive: true });
      });

      it('should change token title', async () => {
        const resp = await request(
          'PUT', `/v2/app-tokens/${lunaToken.id}`,
          { title: 'New token title' },
          { 'X-Authentication-Token': luna.authToken },
        );
        expect(resp, 'to satisfy', {
          __httpStatus: 200,
          token:        { title: 'New token title' },
        });
      });

      it('should not change inactivated token title', async () => {
        await lunaToken.inactivate();

        const resp = await request(
          'PUT', `/v2/app-tokens/${lunaToken.id}`,
          { title: 'New token title' },
          { 'X-Authentication-Token': luna.authToken },
        );
        expect(resp, 'to satisfy', { __httpStatus: 404 });
      });
    });

    describe('Scopes list', () => {
      it('should return app tokens scopes list', async () => {
        const resp = await request('GET', `/v2/app-tokens/scopes`);
        expect(resp, 'to equal', { scopes: appTokensScopes, __httpStatus: 200 });
      });
    });

    describe('Tokens list', () => {
      before(async () => {
        await $pg_database.raw(`delete from app_tokens where user_id = :userId`, { userId: mars.user.id });

        for (let i = 0; i < 3; i++) {
          const token = new AppTokenV1({
            userId: mars.user.id,
            title:  `My token #${i + 1}`,
            scopes: ['read-my-info', 'manage-posts'],
          });
          await token.create(); // eslint-disable-line no-await-in-loop
        }
      });

      it('should return list of tokens', async () => {
        const resp = await request(
          'GET', `/v2/app-tokens`,
          null,
          { 'X-Authentication-Token': mars.authToken },
        );
        expect(resp, 'to satisfy', {
          tokens: [
            { ...appTokenInfo, title: 'My token #3' },
            { ...appTokenInfo, title: 'My token #2' },
            { ...appTokenInfo, title: 'My token #1' },
          ],
        });
      });
    });
  });
});

describe('Realtime', () => {
  let port;
  let luna, post, session, token, token2;

  before(async () => {
    await cleanDB($pg_database);
    const app = await getSingleton();
    port = process.env.PEPYATKA_SERVER_PORT || app.context.config.port;
    const pubsubAdapter = new PubSubAdapter($database);
    PubSub.setPublisher(pubsubAdapter);

    luna = await createTestUser();
    await goPrivate(luna);

    token = new AppTokenV1({
      userId: luna.user.id,
      title:  'App with realtime',
      scopes: ['read-realtime'],
    });
    token2 = new AppTokenV1({
      userId: luna.user.id,
      title:  'App without realtime',
      scopes: ['read-my-info'],
    });
    await Promise.all([token, token2].map((t) => t.create()));

    post = await createAndReturnPost(luna, 'Luna post');
  });

  beforeEach(async () => {
    session = await Session.create(port, 'Luna session');
    await session.sendAsync('subscribe', { post: [post.id] });
  });
  afterEach(() => session.disconnect());

  it('sould not deliver post event to anonymous session', async () => {
    const test = session.notReceiveWhile(
      'comment:new',
      createCommentAsync(luna, post.id, 'Hello'),
    );
    await expect(test, 'to be fulfilled');
  });

  it('sould deliver post event to session with Luna session token', async () => {
    await session.sendAsync('auth', { authToken: luna.authToken });
    const test = session.receiveWhile(
      'comment:new',
      createCommentAsync(luna, post.id, 'Hello'),
    );
    await expect(test, 'to be fulfilled');
  });

  it('sould deliver post event to session with correct app token', async () => {
    await session.sendAsync('auth', { authToken: token.tokenString() });
    const test = session.receiveWhile(
      'comment:new',
      createCommentAsync(luna, post.id, 'Hello'),
    );
    await expect(test, 'to be fulfilled');
  });

  it('sould not deliver post event to session with incorrect app token', async () => {
    await session.sendAsync('auth', { authToken: token2.tokenString() });
    const test = session.notReceiveWhile(
      'comment:new',
      createCommentAsync(luna, post.id, 'Hello'),
    );
    await expect(test, 'to be fulfilled');
  });
});

describe('Full access', () => {
  let luna, token;

  before(async () => {
    await cleanDB($pg_database);

    luna = await createTestUser();
    await $pg_database.raw(
      `update users set private_meta = '{"foo":"bar"}' where uid = :userId`,
      { userId: luna.user.id },
    );

    token = new AppTokenV1({
      userId: luna.user.id,
      title:  'App',
      scopes: ['read-my-info', 'manage-profile'],
    });
    await token.create();
  });

  it('should update users email with session token', async () => {
    await updateUserAsync(luna, { screenName: 'Name1', email: 'name1@host.org' });
    const u = await dbAdapter.getUserById(luna.user.id);
    expect(u, 'to satisfy', {
      id:         luna.user.id,
      screenName: 'Name1',
      email:      'name1@host.org',
    });
  });

  it('should not update users email with app token', async () => {
    await updateUserAsync(
      { ...luna, authToken: token.tokenString() },
      { screenName: 'Name2', email: 'name2@host.org' },
    );
    const u = await dbAdapter.getUserById(luna.user.id);
    expect(u, 'to satisfy', {
      id:         luna.user.id,
      screenName: 'Name2',
      email:      'name1@host.org',
    });
  });

  it('should return privateMeta in whoami with session token', async () => {
    const resp = await whoami(luna.authToken).then((r) => r.json());
    expect(resp.users.privateMeta, 'to equal', { foo: 'bar' });
  });

  it('should not return privateMeta in whoami with app token', async () => {
    const resp = await whoami(token.tokenString()).then((r) => r.json());
    expect(resp.users.privateMeta, 'to equal', {});
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
