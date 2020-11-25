/* eslint-env node, mocha */
/* global $database, $pg_database */
import expect from 'unexpected';
import { uniq, difference } from 'lodash';
import { DateTime } from 'luxon';
import config from 'config';

import cleanDB from '../dbCleaner';
import { getSingleton } from '../../app/app';
import { dbAdapter, PubSub } from '../../app/models';
import { appTokensScopes, alwaysAllowedRoutes, alwaysDisallowedRoutes } from '../../app/models/auth-tokens/app-tokens-scopes';
import { PubSubAdapter } from '../../app/support/PubSubAdapter';
import { createRouter } from '../../app/routes';

import {
  performJSONRequest,
  createTestUsers,
  createTestUser,
  goPrivate,
  createAndReturnPost,
  createCommentAsync,
  updateUserAsync,
  whoami,
  authHeaders,
} from './functional_test_helper';
import { UUID, appTokenInfo, appTokenInfoRestricted } from './schemaV2-helper';
import Session from './realtime-session';


describe('Routes coverage', () => {
  const router = createRouter();
  const allRoutes = uniq(router.stack
    .map((l) => l.methods.map((m) => `${m === 'HEAD' ? 'GET' : m} ${l.path}`))
    .flat()
  );
  const allScopedRoutes = uniq([
    alwaysAllowedRoutes,
    alwaysDisallowedRoutes,
    appTokensScopes.map((s) => s.routes),
  ].flat(2));

  it('should be no routes in scopes that isnt exists in router', () => {
    const diff = difference(allScopedRoutes, allRoutes);
    // Only the 'WS *' pseudo-route is allowed
    expect(diff, 'to equal', ['WS *']);
  });

  for (const route of allRoutes) {
    it(`should cover the '${route}' route`, () => {
      const inLists =
        (alwaysAllowedRoutes.includes(route) ? 1 : 0) +
        (alwaysDisallowedRoutes.includes(route) ? 1 : 0) +
        (appTokensScopes.some(({ routes }) => routes.includes(route)) ? 1 : 0) ;

      if (inLists === 0) {
        expect.fail(`Route isn't found in any lists (effectively disallowed)`);
      } else if (inLists > 1) {
        expect.fail(`Route is found in more that one lists`);
      }
    });
  }
});

describe('App tokens controller', () => {
  before(() => cleanDB($pg_database));

  describe('Luna and Mars creates tokens', () => {
    let luna, lunaToken;
    let mars, marsToken;
    before(async () => {
      [luna, mars] = await createTestUsers(2);
      lunaToken = await dbAdapter.createAppToken({
        userId: luna.user.id,
        title:  'My app',
        scopes: ['read-my-info', 'manage-posts'],
      });
      marsToken = await dbAdapter.createAppToken({
        userId: mars.user.id,
        title:  'My app',
        scopes: ['read-my-info', 'manage-posts'],
      });
    });

    it('should create token', async () => {
      const resp = await performJSONRequest(
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
          expiresAt:     null,
          lastUsedAt:    null,
          lastIP:        null,
          lastUserAgent: null,
        },
        tokenString: expect.it('to be a string'),
      });
    });

    it('should create token with expiration time in seconds', async () => {
      const resp = await performJSONRequest(
        'POST', '/v2/app-tokens',
        {
          title:     'App1',
          scopes:    [],
          expiresAt: 100,
        },
        authHeaders(luna),
      );

      const createdAt = new Date(resp.token.createdAt);
      const expiresAt = new Date(resp.token.expiresAt);
      expect(expiresAt - createdAt, 'to be', 100 * 1000);
    });

    it('should create token with expiration time in ISO 8601 format', async () => {
      const expiresAt = DateTime.local().plus({ seconds: 100 }).toJSDate();
      const resp = await performJSONRequest(
        'POST', '/v2/app-tokens',
        {
          title:     'App1',
          scopes:    [],
          expiresAt: expiresAt.toISOString(),
        },
        authHeaders(luna),
      );

      expect(resp.token.expiresAt, 'to be', expiresAt.toISOString());
    });

    it('should return "whoami" data with token', async () => {
      const resp = await performJSONRequest(
        'GET', '/v2/users/whoami',
        null,
        { 'X-Authentication-Token': lunaToken.tokenString() },
      );
      expect(resp, 'to satisfy', { users: { id: luna.user.id } });
    });

    it('should reject "/v1/users/:username" request with token', async () => {
      const resp = await performJSONRequest(
        'GET', `/v1/users/${luna.username}`,
        null,
        { 'X-Authentication-Token': lunaToken.tokenString() },
      );
      expect(resp, 'to have key', 'err');
    });

    it('should return current app token', async () => {
      const resp = await performJSONRequest(
        'GET', `/v2/app-tokens/current`,
        null,
        { 'X-Authentication-Token': lunaToken.tokenString() },
      );
      expect(resp, 'to satisfy', { __httpCode: 200, token: { ...appTokenInfoRestricted, id: lunaToken.id } });
    });

    it('should not return current app token being used with session token', async () => {
      const resp = await performJSONRequest(
        'GET', `/v2/app-tokens/current`,
        null,
        { 'X-Authentication-Token': luna.authToken },
      );
      expect(resp, 'to satisfy', { __httpCode: 400 });
    });

    describe('Invalidation', () => {
      after(async () => {
        await dbAdapter.updateAppToken(lunaToken.id, { isActive: true });
      });

      it('should invalidate token', async () => {
        const resp = await performJSONRequest(
          'DELETE', `/v2/app-tokens/${lunaToken.id}`,
          null,
          { 'X-Authentication-Token': luna.authToken },
        );
        expect(resp, 'to satisfy', { __httpCode: 200 });
      });

      it('should invalidate invalidated token', async () => {
        const resp = await performJSONRequest(
          'DELETE', `/v2/app-tokens/${lunaToken.id}`,
          null,
          { 'X-Authentication-Token': luna.authToken },
        );
        expect(resp.__httpCode, 'to be', 200);
      });

      it('should not invalidate token of another user', async () => {
        const resp = await performJSONRequest(
          'DELETE', `/v2/app-tokens/${marsToken.id}`,
          null,
          { 'X-Authentication-Token': luna.authToken },
        );
        expect(resp, 'to satisfy', { __httpCode: 404 });
      });

      it('should reject "whoami" request with invalidated token', async () => {
        const resp = await performJSONRequest(
          'GET', '/v2/users/whoami',
          null,
          { 'X-Authentication-Token': lunaToken.tokenString() },
        );
        expect(resp, 'to satisfy', { __httpCode: 401 });
      });
    });

    describe('Reissue', () => {
      let newLunaTokenString;

      after(async () => {
        await dbAdapter.updateAppToken(lunaToken.id, { isActive: true, issue: 1 });
      });

      it('should reissue token', async () => {
        const resp = await performJSONRequest(
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
        const resp = await performJSONRequest(
          'POST', `/v2/app-tokens/${marsToken.id}/reissue`,
          {},
          { 'X-Authentication-Token': luna.authToken },
        );
        expect(resp, 'to satisfy', { __httpCode: 404 });
      });

      it('should reissue token being auhtenticated by itself', async () => {
        const resp = await performJSONRequest(
          'POST', `/v2/app-tokens/current/reissue`,
          {},
          { 'X-Authentication-Token': newLunaTokenString },
        );
        expect(resp, 'to satisfy', {
          __httpCode: 200,
          token:      { ...appTokenInfoRestricted, issue: 3 },
        });

        newLunaTokenString = resp.tokenString;
      });

      it('should not reissue inactivated token', async () => {
        await lunaToken.inactivate();

        const resp = await performJSONRequest(
          'POST', `/v2/app-tokens/${lunaToken.id}/reissue`,
          {},
          { 'X-Authentication-Token': luna.authToken },
        );
        expect(resp, 'to satisfy', { __httpCode: 404 });
      });
    });

    describe('Title change', () => {
      after(async () => {
        await dbAdapter.updateAppToken(lunaToken.id, { isActive: true });
      });

      it('should change token title', async () => {
        const resp = await performJSONRequest(
          'PUT', `/v2/app-tokens/${lunaToken.id}`,
          { title: 'New token title' },
          { 'X-Authentication-Token': luna.authToken },
        );
        expect(resp, 'to satisfy', {
          __httpCode: 200,
          token:      { title: 'New token title' },
        });
      });

      it('should not change inactivated token title', async () => {
        await lunaToken.inactivate();

        const resp = await performJSONRequest(
          'PUT', `/v2/app-tokens/${lunaToken.id}`,
          { title: 'New token title' },
          { 'X-Authentication-Token': luna.authToken },
        );
        expect(resp, 'to satisfy', { __httpCode: 404 });
      });
    });

    describe('Scopes list', () => {
      it('should return app tokens scopes list', async () => {
        const resp = await performJSONRequest('GET', `/v2/app-tokens/scopes`);
        expect(resp, 'to equal', { scopes: appTokensScopes, __httpCode: 200 });
      });
    });

    describe('Tokens list', () => {
      before(async () => {
        await $pg_database.raw(`delete from app_tokens where user_id = :userId`, { userId: mars.user.id });

        for (let i = 0; i < 3; i++) {
          // eslint-disable-next-line no-await-in-loop
          await dbAdapter.createAppToken({
            userId: mars.user.id,
            title:  `My token #${i + 1}`,
            scopes: ['read-my-info', 'manage-posts'],
          });
        }
      });

      it('should return list of tokens', async () => {
        const resp = await performJSONRequest(
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

    describe('Token with IP restrictions', () => {
      let token;
      before(async () => {
        token = await dbAdapter.createAppToken({
          userId:       luna.user.id,
          title:        'My app',
          scopes:       ['read-my-info'],
          restrictions: { netmasks: ['127.0.0.1/24'] },
        });
      });

      it('should allow "/v1/users/me" request with token', async () => {
        const resp = await performJSONRequest(
          'GET', `/v1/users/me`,
          null,
          { 'X-Authentication-Token': token.tokenString() },
        );
        expect(resp, 'to satisfy', { __httpCode: 200 });
      });
    });

    describe('Token without scopes', () => {
      let token;
      before(async () => {
        token = await dbAdapter.createAppToken({
          userId: luna.user.id,
          title:  'My app',
        });
      });

      it('should allow "/v1/users/me" request with token', async () => {
        const resp = await performJSONRequest(
          'GET', `/v1/users/me`,
          null,
          { 'X-Authentication-Token': token.tokenString() },
        );
        expect(resp, 'to satisfy', { __httpCode: 200 });
      });

      it('should allow "/v2/app-tokens/current" request with token', async () => {
        const resp = await performJSONRequest(
          'GET', `/v2/app-tokens/current`,
          null,
          { 'X-Authentication-Token': token.tokenString() },
        );
        expect(resp, 'to satisfy', { __httpCode: 200 });
      });
      it('should reject "/v1/users/:username" request with token', async () => {
        const resp = await performJSONRequest(
          'GET', `/v1/users/${luna.username}`,
          null,
          { 'X-Authentication-Token': token.tokenString() },
        );
        expect(resp, 'to have key', 'err');
      });
    });
  });
});

describe('Realtime', () => {
  let app;
  let port;
  let luna, post, session, token, token2;

  before(async () => {
    await cleanDB($pg_database);
    app = await getSingleton();
    port = process.env.PEPYATKA_SERVER_PORT || app.context.config.port;
    const pubsubAdapter = new PubSubAdapter($database);
    PubSub.setPublisher(pubsubAdapter);

    luna = await createTestUser();
    await goPrivate(luna);

    token = await dbAdapter.createAppToken({
      userId: luna.user.id,
      title:  'App with realtime',
      scopes: ['read-realtime'],
    });
    token2 = await dbAdapter.createAppToken({
      userId: luna.user.id,
      title:  'App without realtime',
      scopes: ['read-my-info'],
    });

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
      () => createCommentAsync(luna, post.id, 'Hello'),
    );
    await expect(test, 'to be fulfilled');
  });

  it('sould deliver post event to session with Luna session token', async () => {
    await session.sendAsync('auth', { authToken: luna.authToken });
    const test = session.receiveWhile(
      'comment:new',
      () => createCommentAsync(luna, post.id, 'Hello'),
    );
    await expect(test, 'to be fulfilled');
  });

  it('sould deliver post event to session with correct app token', async () => {
    await session.sendAsync('auth', { authToken: token.tokenString() });
    const test = session.receiveWhile(
      'comment:new',
      () => createCommentAsync(luna, post.id, 'Hello'),
    );
    await expect(test, 'to be fulfilled');
  });

  it('sould not allow to authorize with incorrect app token', async () => {
    const promise = session.sendAsync('auth', { authToken: token2.tokenString() });
    await expect(promise, 'to be rejected');
  });

  describe('Token inactivation', () => {
    it('should deliver post event to session with active app token', async () => {
      await session.sendAsync('auth', { authToken: token.tokenString() });

      const test = session.receiveWhile(
        'comment:new',
        () => createCommentAsync(luna, post.id, 'Hello'),
      );
      await expect(test, 'to be fulfilled');
    });

    it('should stop sending events after token deactivation and sockets re-authorization', async () => {
      await session.sendAsync('auth', { authToken: token.tokenString() });

      // Inactivate token
      await token.inactivate();

      {
        const test = session.receiveWhile(
          'comment:new',
          () => createCommentAsync(luna, post.id, 'Hello'),
        );
        await expect(test, 'to be fulfilled');
      }

      // Update sockets authorization
      await app.context.pubsub.reAuthorizeSockets();

      {
        const test = session.notReceiveWhile(
          'comment:new',
          () => createCommentAsync(luna, post.id, 'Hello'),
        );
        await expect(test, 'to be fulfilled');
      }
    });
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

    token = await dbAdapter.createAppToken({
      userId: luna.user.id,
      title:  'App',
      scopes: ['read-my-info', 'manage-profile'],
    });
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

describe('Activation codes', () => {
  let luna, tokenId, actCode;

  before(async () => {
    await cleanDB($pg_database);
    luna = await createTestUser();
  });

  it(`should return activation code on token creation`, async () => {
    const resp = await performJSONRequest(
      'POST', '/v2/app-tokens',
      {
        title:  'App1',
        scopes: [],
      },
      authHeaders(luna),
    );

    expect(resp, 'to satisfy', {
      token: {
        id:            expect.it('to satisfy', UUID),
        title:         'App1',
        issue:         1,
        scopes:        [],
        expiresAt:     null,
        lastUsedAt:    null,
        lastIP:        null,
        lastUserAgent: null,
      },
      tokenString:       expect.it('to be a string'),
      activationCode:    expect.it('to satisfy', /^[A-Z0-9]{6}$/),
      activationCodeTTL: config.appTokens.activationCodeTTL,
    });

    tokenId = resp.token.id;
    actCode = resp.activationCode;
  });

  it(`should return new activation code after the token reissue`, async () => {
    const resp = await performJSONRequest(
      'POST', `/v2/app-tokens/${tokenId}/reissue`,
      {},
      authHeaders(luna),
    );

    expect(resp, 'to satisfy', {
      token: {
        id:    tokenId,
        issue: 2,
      },
      tokenString:       expect.it('to be a string'),
      activationCode:    expect.it('to satisfy', /^[A-Z0-9]{6}$/).and('not to be', actCode),
      activationCodeTTL: config.appTokens.activationCodeTTL,
    });

    actCode = resp.activationCode;
  });

  let tokenString;

  it(`should return reissued token by activation code`, async () => {
    const resp = await performJSONRequest(
      'POST', `/v2/app-tokens/activate`,
      { activationCode: actCode }
    );

    expect(resp, 'to satisfy', {
      token: {
        id:    tokenId,
        issue: 3,
      },
      tokenString: expect.it('to be a string'),
    });

    ({ tokenString } = resp);
  });

  it(`should use the token string`, async () => {
    const resp = await performJSONRequest(
      'GET', `/v1/users/me`,
      null, { Authorization: `Bearer ${tokenString}` }
    );

    expect(resp, 'to satisfy', { users: { id: luna.user.id } });
  });

  it(`should not allow to use activation code twice`, async () => {
    const resp = await performJSONRequest(
      'POST', `/v2/app-tokens/activate`,
      { activationCode: actCode }
    );

    expect(resp, 'to satisfy', { __httpCode: 404 });
  });
});
