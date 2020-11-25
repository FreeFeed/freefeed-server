/* eslint-env node, mocha */
/* global $pg_database */
import unexpected from 'unexpected';
import unexpectedDate from 'unexpected-date';
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid';
import config from 'config';

import cleanDB from '../../dbCleaner';
import { User, SessionTokenV0, AppTokenV1, dbAdapter } from '../../../app/models';
import { withAuthToken, tokenFromJWT } from '../../../app/controllers/middlewares/with-auth-token';


const expect = unexpected.clone();
expect.use(unexpectedDate);

describe('tokenFromJWT', () => {
  before(() => cleanDB($pg_database));

  let luna, sessToken, appToken;
  before(async () => {
    luna = new User({ username: 'luna', password: 'pw' });
    await luna.create();
    sessToken = new SessionTokenV0(luna.id);
    appToken = await dbAdapter.createAppToken({
      userId:       luna.id,
      title:        'My app',
      scopes:       ['read-my-info'],
      restrictions: {
        netmasks: ['127.0.0.1/24'],
        origins:  ['https://localhost']
      }
    });
  });

  const defaultContext = () => ({
    headers:  { origin: 'https://localhost' },
    remoteIP: '127.0.0.1',
    route:    'GET /v2/users/whoami',
  });

  describe('Bad tokens', () => {
    it('should give anonymous access without token', async () => {
      await expect(tokenFromJWT('bad token', defaultContext()), 'to be rejected with', { status: 401 });
    });
  });

  describe('SessionTokenV0', () => {
    it('should give access with correct token', async () => {
      const result = await tokenFromJWT(sessToken.tokenString(), defaultContext());
      expect(result, 'to satisfy', { authToken: sessToken, user: { id: luna.id } });
    });

    it('should not give access with incorrect token', async () => {
      const { secret } = config;
      const fakeTokenString = jwt.sign({ userId: uuidv4() }, secret);

      const promise = tokenFromJWT(fakeTokenString, defaultContext());
      await expect(promise, 'to be rejected with', { status: 401 });
    });
  });

  describe('AppTokenV1', () => {
    it('should not give access with invalid token ID', async () => {
      const { secret } = config;
      const fakeTokenString = jwt.sign({
        type:   AppTokenV1.TYPE,
        id:     uuidv4(),
        issue:  appToken.issue,
        userId: appToken.userId,
      }, secret);

      await expect(tokenFromJWT(fakeTokenString, defaultContext()), 'to be rejected with', { status: 401 });
    });

    it('should not give access with invalid token issue number', async () => {
      const { secret } = config;
      const fakeTokenString = jwt.sign({
        type:   AppTokenV1.TYPE,
        id:     appToken.id,
        issue:  appToken.issue + 1,
        userId: appToken.userId,
      }, secret);

      await expect(tokenFromJWT(fakeTokenString, defaultContext()), 'to be rejected with', { status: 401 });
    });

    it('should not give access from invalid IP address', async () => {
      const ctx = defaultContext();
      ctx.remoteIP = '127.0.1.1';

      await expect(tokenFromJWT(appToken.tokenString(), ctx), 'to be rejected with', { status: 401 });
    });

    it('should not give access from invalid origin', async () => {
      const ctx = defaultContext();
      ctx.headers['origin'] = 'https://evil.com';

      await expect(tokenFromJWT(appToken.tokenString(), ctx), 'to be rejected with', { status: 401 });
    });

    it('should not give access to the invalid route', async () => {
      const ctx = defaultContext();
      ctx.route = 'GET /v1/invalid';

      await expect(tokenFromJWT(appToken.tokenString(), ctx), 'to be rejected with', { status: 401 });
    });

    it('should give access with correct context', async () => {
      const result = await tokenFromJWT(appToken.tokenString(), defaultContext());
      expect(result, 'to satisfy', { authToken: appToken, user: { id: luna.id } });
    });

    it('should give access to always allowed route', async () => {
      const ctx = defaultContext();
      ctx.route = 'GET /v1/users/me';
      const result = await tokenFromJWT(appToken.tokenString(), ctx);
      expect(result, 'to satisfy', { authToken: appToken, user: { id: luna.id } });
    });
  });
});

describe('withAuthToken middleware', () => {
  before(() => cleanDB($pg_database));

  let luna;
  before(async () => {
    luna = new User({ username: 'luna', password: 'pw' });
    await luna.create();
  });

  describe('Token souces', () => {
    let authToken;
    before(() => authToken = new SessionTokenV0(luna.id).tokenString());

    it('should accept token in ctx.query.authToken', async () => {
      const ctx = { query: { authToken }, request: { body: {} }, headers: {}, state: {} };
      await withAuthToken(ctx, () => null);
      expect(ctx.state, 'to satisfy', { user: { id: luna.id } });
    });

    it('should accept token in ctx.request.body.authToken', async () => {
      const ctx = { query: { }, request: { body: { authToken } }, headers: {}, state: {} };
      await withAuthToken(ctx, () => null);
      expect(ctx.state, 'to satisfy', { user: { id: luna.id } });
    });

    it(`should accept token in 'x-authentication-token' header`, async () => {
      const ctx = { query: { }, request: { body: { } }, headers: { 'x-authentication-token': authToken }, state: {} };
      await withAuthToken(ctx, () => null);
      expect(ctx.state, 'to satisfy', { user: { id: luna.id } });
    });

    it(`should accept token in 'authorization' header`, async () => {
      const ctx = { query: { }, request: { body: { } }, headers: { 'authorization': `Bearer ${authToken}` }, state: {} };
      await withAuthToken(ctx, () => null);
      expect(ctx.state, 'to satisfy', { user: { id: luna.id } });
    });

    it(`should not accept invalid in 'authorization' header`, async () => {
      const ctx = { query: { }, request: { body: { } }, headers: { 'authorization': `BeaRER ${authToken}` }, state: {} };
      await expect(withAuthToken(ctx, () => null), 'to be rejected with', { status: 401 });
    });
  });

  describe('AppTokenV1', () => {
    let token;

    const context = () => ({
      ip:      '127.0.0.127',
      method:  'POST',
      url:     '/v1/posts',
      headers: {
        'user-agent': 'Lynx browser, Linux',
        'x-real-ip':  '127.0.0.128',
        'origin':     'https://localhost',
      },
      request: { body: {} },
      state:   { matchedRoute: '/v1/posts' },
    });


    before(async () => {
      token = await dbAdapter.createAppToken({
        userId:       luna.id,
        title:        'My app',
        scopes:       ['read-my-info', 'manage-posts'],
        restrictions: {
          netmasks: ['127.0.0.1/24'],
          origins:  ['https://localhost']
        }
      });
    });

    it('should set last* fields of token', async () => {
      const t1 = await dbAdapter.createAppToken({
        userId:       luna.id,
        title:        'My app',
        scopes:       ['read-my-info', 'manage-posts'],
        restrictions: {
          netmasks: ['127.0.0.1/24'],
          origins:  ['https://localhost']
        }
      });

      const ctx = context();
      ctx.headers['x-authentication-token'] = t1.tokenString();
      await withAuthToken(ctx, () => null);

      const [t2, now] = await Promise.all([
        dbAdapter.getAppTokenById(t1.id),
        dbAdapter.now(),
      ]);
      expect(new Date(t2.lastUsedAt), 'to be close to', now);
      expect(t2.lastIP, 'to be', ctx.ip);
      expect(t2.lastUserAgent, 'to be', ctx.headers['user-agent']);
    });

    it('should not write log entry after GET requests', async () => {
      const { rows: logRows } = await $pg_database.raw('select * from app_tokens_log where token_id = :id limit 1', { id: token.id });
      expect(logRows, 'to be empty');
    });

    it('should write log entry after POST request', async () => {
      const ctx = context();
      ctx.headers['x-authentication-token'] = token.tokenString();
      ctx.state.appTokenLogPayload = { postId: 'post1' };
      await withAuthToken(ctx, () => null);

      const { rows: logRows } = await $pg_database.raw('select * from app_tokens_log where token_id = :id limit 1', { id: token.id });
      expect(logRows, 'to satisfy', [{
        token_id:   token.id,
        request:    'POST /v1/posts',
        ip:         '127.0.0.127',
        user_agent: 'Lynx browser, Linux',
        extra:      { postId: 'post1', 'x-real-ip': '127.0.0.128' },
      }]);
    });
  });
});
