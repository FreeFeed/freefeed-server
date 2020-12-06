/* eslint-env node, mocha */
/* global $pg_database */
import unexpected from 'unexpected';
import unexpectedDate from 'unexpected-date';
import unexpectedSinon from 'unexpected-sinon';
import sinon from 'sinon';
import config from 'config';
import { simpleParser } from 'mailparser';

import cleanDB from '../../dbCleaner';
import { User, SessionTokenV0, dbAdapter } from '../../../app/models';
import { withAuthToken } from '../../../app/controllers/middlewares/with-auth-token';
import { ACTIVE, BLOCKED } from '../../../app/models/auth-tokens/SessionTokenV1';
import { addMailListener } from '../../../lib/mailer';


const expect = unexpected.clone();
expect.use(unexpectedDate);
expect.use(unexpectedSinon);

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

    const context = (tokenString = null) => ({
      ip:      '127.0.0.127',
      method:  'POST',
      url:     '/v1/posts',
      headers: {
        'user-agent': 'Lynx browser, Linux',
        'x-real-ip':  '127.0.0.128',
        'origin':     'https://localhost',
        ...(tokenString ? { authorization: `Bearer ${tokenString}` } : {}),
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

      const ctx = context(t1.tokenString());
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
      const ctx = context(token.tokenString());
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

    it('should not give access from invalid IP address', async () => {
      const ctx = context(token.tokenString());
      ctx.ip = '127.0.1.1';

      await expect(withAuthToken(ctx, () => null), 'to be rejected with', { status: 401 });
    });

    it('should not give access with invalid token issue', async () => {
      const tokenString = token.tokenString();
      await token.reissue();

      const ctx = context(tokenString);
      await expect(withAuthToken(ctx, () => null), 'to be rejected with', { status: 401 });
    });

    it('should not give access with expired token', async () => {
      const t = await dbAdapter.createAppToken({ userId: luna.id, title: 'My app', expiresAtSeconds: 0 });
      const tokenString = t.tokenString();

      const ctx = context(tokenString);
      await expect(withAuthToken(ctx, () => null), 'to be rejected with', { status: 401 });
    });

    it('should not give access from invalid origin', async () => {
      const ctx = context(token.tokenString());
      ctx.headers['origin'] = 'https://evil.com';

      await expect(withAuthToken(ctx, () => null), 'to be rejected with', { status: 401 });
    });

    it('should not give access to the invalid route', async () => {
      const ctx = context(token.tokenString());
      ctx.method = 'GET';
      ctx.state.matchedRoute = '/v1/invalid';

      await expect(withAuthToken(ctx, () => null), 'to be rejected with', { status: 401 });
    });

    it('should give access with correct context', async () => {
      const ctx = context(token.tokenString());
      await expect(withAuthToken(ctx, () => null), 'to be fulfilled');
    });

    it('should give access to always allowed route', async () => {
      const ctx = context(token.tokenString());
      ctx.method = 'GET';
      ctx.state.matchedRoute = '/v1/users/me';
      await expect(withAuthToken(ctx, () => null), 'to be fulfilled');
    });
  });

  describe('SessionTokenV1', () => {
    const context = (tokenString = null) => ({
      ip:      '127.0.0.127',
      headers: {
        'user-agent': 'Lynx browser, Linux',
        ...(tokenString ? { authorization: `Bearer ${tokenString}` } : {}),
      },
      state: {},
    });

    describe('Last* fields', () => {
      let session;

      before(async () => {
        session = await dbAdapter.createAuthSession(luna.id);
      });

      it('should set last* fields of token', async () => {
        expect(session, 'to satisfy', {
          lastUsedAt:    null,
          lastIP:        null,
          lastUserAgent: null,
        });

        const ctx = context(session.tokenString());
        const handler = sinon.spy()
        await withAuthToken(ctx, handler);

        expect(handler, 'was called');

        session = await dbAdapter.getAuthSessionById(session.id);
        expect(session, 'to satisfy', {
          lastUsedAt:    expect.it('to be close to', session.databaseTime),
          lastIP:        ctx.ip,
          lastUserAgent: ctx.headers['user-agent'],
        });
      });
    });

    describe('Issue mismatch', () => {
      let session;
      const email = 'luna@example.com';

      before(async () => {
        session = await dbAdapter.createAuthSession(luna.id);
        await luna.update({ email });
      });

      let capturedMail = null;
      let removeMailListener = () => null;
      before(() => (removeMailListener = addMailListener((r) => (capturedMail = r))));
      after(removeMailListener);
      beforeEach(() => (capturedMail = null));

      it('should allow token with recently changed issue', async () => {
        const tokenString = session.tokenString();
        await session.reissue();

        const ctx = context(tokenString);
        const handler = sinon.spy()

        await expect(withAuthToken(ctx, handler), 'to be fulfilled');
        expect(handler, 'was called');
      });

      it('should block token when issue is changed more than by one', async () => {
        const tokenString = session.tokenString();
        await session.reissue();
        await session.reissue();

        const ctx = context(tokenString);
        const handler = sinon.spy()

        await expect(withAuthToken(ctx, handler), 'to be rejected');
        expect(handler, 'was not called');

        // Email was sent
        expect(capturedMail, 'to satisfy', { envelope: { to: [email] } });
        const parsedMail = await simpleParser(capturedMail.response);
        expect(parsedMail, 'to satisfy', { subject: 'Your session has been blocked', });

        // The session is blocked now
        const s = await dbAdapter.getAuthSessionById(session.id);
        expect(s.status, 'to be', BLOCKED);
      });

      it('should not allow inactive token', async () => {
        const ctx = context(session.tokenString());
        const handler = sinon.spy()

        await expect(withAuthToken(ctx, handler), 'to be rejected');
        expect(handler, 'was not called');
      });
    });

    describe('Token with previous issue', () => {
      let session, tokenString;

      before(async () => {
        session = await dbAdapter.createAuthSession(luna.id);
        tokenString = session.tokenString();
        await session.reissue();
      });

      it('should return token when issue is changed not long ago', async () => {
        const updatedAt = new Date(Date.now() - (1000 * (config.authSessions.reissueGraceIntervalSec - 10)));

        await dbAdapter.updateAuthSession(session.id, { updatedAt });
        await expect(withAuthToken(context(tokenString), () => null), 'to be fulfilled');

        const s = await dbAdapter.getAuthSessionById(session.id);
        expect(s.status, 'to be', ACTIVE);
      });

      it('should not return token when issue is changed long ago', async () => {
        const updatedAt = new Date(Date.now() - (1000 * (config.authSessions.reissueGraceIntervalSec + 10)));

        await dbAdapter.updateAuthSession(session.id, { updatedAt });
        await expect(withAuthToken(context(tokenString), () => null), 'to be rejected');

        const s = await dbAdapter.getAuthSessionById(session.id);
        expect(s.status, 'to be', BLOCKED);
      });
    });
  });
});
