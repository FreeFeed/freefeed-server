/* eslint-env node, mocha */
/* global $pg_database */
import _ from 'lodash';
import unexpected from 'unexpected';
import unexpectedDate from 'unexpected-date';
import jwt from 'jsonwebtoken';
import { DateTime } from 'luxon';
import config from 'config';

import cleanDB from '../../dbCleaner';
import {
  User,
  SessionTokenV0,
  AppTokenV1,
  dbAdapter,
  Job,
  SessionTokenV1,
  sessionTokenV1Store,
} from '../../../app/models';
import { initJobProcessing } from '../../../app/jobs';
import {
  PERIODIC_CLEAN_AUTH_SESSIONS,
  PERIODIC_INACTIVATE_APP_TOKENS,
} from '../../../app/jobs/periodic/auth-tokens';
import { ACTIVE, CLOSED } from '../../../app/models/auth-tokens/SessionTokenV1';

const expect = unexpected.clone();
expect.use(unexpectedDate);

describe('Auth Tokens', () => {
  before(() => cleanDB($pg_database));

  let luna;
  before(async () => {
    luna = new User({ username: 'luna', password: 'pw' });
    await luna.create();
  });

  describe('SessionTokenV0', () => {
    let token;

    before(() => {
      token = new SessionTokenV0(luna.id);
    });

    it('should have a full access', () => {
      expect(token.hasFullAccess, 'to be true');
    });

    it('should hold Luna user ID', () => {
      expect(token.userId, 'to be', luna.id);
    });

    it('should make a valid JWT', async () => {
      const jToken = token.tokenString();
      const decoded = await jwt.verifyAsync(jToken, config.secret);
      expect(decoded, 'to not have key', 'type');
      expect(decoded.userId, 'to be', luna.id);
    });
  });

  describe('AppTokenV1', () => {
    describe('Luna creates a token with "read-my-info" and "manage-posts" rights', () => {
      let token;
      before(async () => {
        token = await dbAdapter.createAppToken({
          userId: luna.id,
          title: 'My app',
          scopes: ['read-my-info', 'manage-posts'],
          restrictions: {
            netmasks: ['127.0.0.1/24'],
            origins: ['https://localhost'],
          },
        });
      });

      it('should load token by id', async () => {
        const t2 = await dbAdapter.getAppTokenById(token.id);
        expect(t2 instanceof AppTokenV1, 'to be true');
        expect(
          t2,
          'to satisfy',
          _.pick(token, ['id', 'title', 'userId', 'issue', 'scopes', 'restrictions']),
        );
      });

      it('should load token by id and issue', async () => {
        const t2 = await dbAdapter.getActiveAppTokenByIdAndIssue(token.id, token.issue);
        expect(t2 instanceof AppTokenV1, 'to be true');
        expect(
          t2,
          'to satisfy',
          _.pick(token, ['id', 'title', 'userId', 'issue', 'scopes', 'restrictions']),
        );
      });

      it('should not load token by id and invalid issue', async () => {
        const t2 = await dbAdapter.getActiveAppTokenByIdAndIssue(token.id, token.issue + 1);
        expect(t2, 'to be null');
      });

      it('should inactivate token', async () => {
        const t = await dbAdapter.createAppToken({
          userId: luna.id,
          title: 'My app',
        });
        expect(t.isActive, 'to be true');
        await t.inactivate();
        expect(t.isActive, 'to be false');
      });

      it('should not load inactive token', async () => {
        const t = await dbAdapter.createAppToken({
          userId: luna.id,
          title: 'My app',
        });
        await t.inactivate();
        const t2 = await dbAdapter.getActiveAppTokenByIdAndIssue(t.id, t.issue);
        expect(t2, 'to be null');
      });

      it('should not have full access', () => {
        expect(token.hasFullAccess, 'to be false');
      });

      it('should hold a Luna user ID', () => {
        expect(token.userId, 'to be', luna.id);
      });

      it('should make a valid JWT', async () => {
        const jToken = token.tokenString();
        const decoded = await jwt.verifyAsync(jToken, config.secret);
        expect(decoded, 'to satisfy', {
          type: AppTokenV1.TYPE,
          userId: luna.id,
        });
        expect(decoded.userId, 'to be', luna.id);
      });

      it('should reissue token', async () => {
        const { issue } = token;
        await token.reissue();
        expect(token.issue, 'to be', issue + 1);
      });

      it('should change token title', async () => {
        const { title } = token;
        await token.setTitle(`${title} updated`);
        expect(token.title, 'to be', `${title} updated`);
      });

      it('should set last* fields', async () => {
        const ip = '127.0.0.127';
        const userAgent = 'Lynx browser, Linux';

        await token.registerUsage({ ip, userAgent });

        const [t2, now] = await Promise.all([dbAdapter.getAppTokenById(token.id), dbAdapter.now()]);
        expect(t2.lastUsedAt, 'to be close to', now);
        expect(t2.lastIP, 'to be', ip);
        expect(t2.lastUserAgent, 'to be', userAgent);
      });

      it('should set last* fields even with empty user agent', async () => {
        const ip = '127.0.0.127';

        await token.registerUsage({ ip });

        const [t2, now] = await Promise.all([dbAdapter.getAppTokenById(token.id), dbAdapter.now()]);
        expect(t2.lastUsedAt, 'to be close to', now);
        expect(t2.lastIP, 'to be', ip);
        expect(t2.lastUserAgent, 'to be', '');
      });

      describe('logRequest', () => {
        beforeEach(() => $pg_database.raw('delete from app_tokens_log'));

        it('should write log entry after POST request', async () => {
          const ctx = {
            ip: '127.0.0.127',
            method: 'POST',
            url: '/v1/posts',
            headers: {
              'user-agent': 'Lynx browser, Linux',
              'x-real-ip': '127.0.0.128',
              origin: 'https://localhost',
            },
            state: { matchedRoute: '/v1/posts' },
          };

          ctx.state.appTokenLogPayload = { postId: 'post1' };
          await token.logRequest(ctx);

          const { rows: logRows } = await $pg_database.raw(
            'select * from app_tokens_log where token_id = :id limit 1',
            {
              id: token.id,
            },
          );
          expect(logRows, 'to satisfy', [
            {
              token_id: token.id,
              request: 'POST /v1/posts',
              ip: '127.0.0.127',
              user_agent: 'Lynx browser, Linux',
              extra: { postId: 'post1', 'x-real-ip': '127.0.0.128' },
            },
          ]);
        });

        it('should write log entry even with empty user agent', async () => {
          const ctx = {
            ip: '127.0.0.127',
            method: 'POST',
            url: '/v1/posts',
            headers: {
              'x-real-ip': '127.0.0.128',
              origin: 'https://localhost',
            },
            state: { matchedRoute: '/v1/posts' },
          };

          ctx.state.appTokenLogPayload = { postId: 'post1' };
          await token.logRequest(ctx);

          const { rows: logRows } = await $pg_database.raw(
            'select * from app_tokens_log where token_id = :id limit 1',
            {
              id: token.id,
            },
          );
          expect(logRows, 'to satisfy', [
            {
              token_id: token.id,
              request: 'POST /v1/posts',
              ip: '127.0.0.127',
              user_agent: '',
              extra: { postId: 'post1', 'x-real-ip': '127.0.0.128' },
            },
          ]);
        });

        it('should not write log entry after GET request', async () => {
          const ctx = {
            ip: '127.0.0.127',
            method: 'GET', // <-- here
            url: '/v1/posts',
            headers: {
              'user-agent': 'Lynx browser, Linux',
              'x-real-ip': '127.0.0.128',
              origin: 'https://localhost',
            },
            state: { matchedRoute: '/v1/posts' },
          };

          ctx.state.appTokenLogPayload = { postId: 'post1' };
          await token.logRequest(ctx);

          const { rows: logRows } = await $pg_database.raw(
            'select * from app_tokens_log where token_id = :id limit 1',
            {
              id: token.id,
            },
          );
          expect(logRows, 'to be empty');
        });

        it('should not write log entry after unsuccessful request', async () => {
          const ctx = {
            ip: '127.0.0.127',
            method: 'POST',
            url: '/v1/posts',
            headers: {
              'user-agent': 'Lynx browser, Linux',
              'x-real-ip': '127.0.0.128',
              origin: 'https://localhost',
            },
            state: { matchedRoute: '/v1/posts' },
            status: 422, // <-- here
          };

          ctx.state.appTokenLogPayload = { postId: 'post1' };
          await token.logRequest(ctx);

          const { rows: logRows } = await $pg_database.raw(
            'select * from app_tokens_log where token_id = :id limit 1',
            {
              id: token.id,
            },
          );
          expect(logRows, 'to be empty');
        });
      });
    });

    describe(`Token expiration`, () => {
      before(() => cleanDB($pg_database));

      let token;

      before(async () => {
        luna = new User({ username: 'luna', password: 'pw' });
        await luna.create();

        token = await dbAdapter.createAppToken({
          userId: luna.id,
          title: 'My app',
        });
      });

      it(`should have nullish expiresAt field on regular token`, () => {
        expect(token.expiresAt, 'to be null');
      });

      it(`should create token with expiresAt field`, async () => {
        const expiresAt = DateTime.local().plus({ hours: 1 }).toJSDate();

        const t = await dbAdapter.createAppToken({
          userId: luna.id,
          title: 'My app',
          expiresAt,
        });
        expect(t.expiresAt, 'to be close to', expiresAt);

        await dbAdapter.deleteAppToken(t.id);
      });

      it(`should create token with expiresAtSeconds field`, async () => {
        const t = await dbAdapter.createAppToken({
          userId: luna.id,
          title: 'My app',
          expiresAtSeconds: 1000,
        });
        const now = await dbAdapter.now();
        expect(t, 'to satisfy', {
          expiresAt: expect.it(
            'to be close to',
            DateTime.fromJSDate(now).plus({ seconds: 1000 }).toJSDate(),
          ),
        });

        await dbAdapter.deleteAppToken(t.id);
      });

      it(`should return token in list of active tokens`, async () => {
        const tokens = await dbAdapter.listActiveAppTokens(luna.id);
        expect(tokens, 'to satisfy', [{ id: token.id }]);
      });

      describe('token is expired', () => {
        before(async () => {
          await dbAdapter.updateAppToken(token.id, {
            expiresAt: DateTime.local().plus({ days: -1 }).toJSDate(),
          });
          token = await dbAdapter.getAppTokenById(token.id);
        });

        after(async () => {
          await dbAdapter.updateAppToken(token.id, {
            expiresAt: DateTime.local().plus({ hours: 1 }).toJSDate(),
          });
          token = await dbAdapter.getAppTokenById(token.id);
        });

        it(`should not return expired token in list of active tokens`, async () => {
          const tokens = await dbAdapter.listActiveAppTokens(luna.id);
          expect(tokens, 'to satisfy', []);
        });

        it(`should not return expired token by id and issue`, async () => {
          const t = await dbAdapter.getActiveAppTokenByIdAndIssue(token.id, token.issue);
          expect(t, 'to be null');
        });
      });
    });

    describe(`Expired tokens inactivation`, () => {
      before(() => cleanDB($pg_database));

      let token, jobId, jobManager;

      before(async () => {
        luna = new User({ username: 'luna', password: 'pw' });
        await luna.create();

        token = await dbAdapter.createAppToken({
          userId: luna.id,
          title: 'My app',
          expiresAtSeconds: 0,
        });

        jobManager = await initJobProcessing();
      });

      it(`should create periodic job that inactivates tokens`, async () => {
        const jobs = await dbAdapter.getAllJobs([PERIODIC_INACTIVATE_APP_TOKENS]);
        expect(jobs, 'to satisfy', [{ name: PERIODIC_INACTIVATE_APP_TOKENS }]);
        jobId = jobs[0].id;
      });

      it(`should inactivate token when job completed`, async () => {
        const job = await Job.getById(jobId);
        await job.setUnlockAt(0);

        {
          const t = await dbAdapter.getAppTokenById(token.id);
          expect(t.isActive, 'to be true');
        }

        await jobManager.fetchAndProcess();

        {
          const t = await dbAdapter.getAppTokenById(token.id);
          expect(t.isActive, 'to be false');
        }
      });
    });

    describe('Activation codes', () => {
      before(() => cleanDB($pg_database));

      let token;

      before(async () => {
        luna = new User({ username: 'luna', password: 'pw' });
        await luna.create();

        token = await dbAdapter.createAppToken({
          userId: luna.id,
          title: 'My app',
          expiresAtSeconds: 100,
        });
      });

      it(`should generate activation code for new token`, () => {
        expect(token.activationCode, 'to satisfy', /\w{6}/);
      });

      it(`should refresh activation code when token reissues`, async () => {
        const prevCode = token.activationCode;
        await token.reissue();
        expect(token.activationCode, 'to satisfy', /\w{6}/);
        expect(token.activationCode, 'not to equal', prevCode);
      });

      it(`should fetch token by activation code`, async () => {
        const t = await dbAdapter.getAppTokenByActivationCode(token.activationCode, 100);
        expect(t, 'to equal', token);
      });

      it(`should not fetch token by expired activation code`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        const t = await dbAdapter.getAppTokenByActivationCode(token.activationCode, 0);
        expect(t, 'to be null');
      });
    });
  });

  describe('SessionTokenV1', () => {
    let session;

    it('should create a session', async () => {
      session = await sessionTokenV1Store.create(luna.id);
      const now = await dbAdapter.now();
      expect(session instanceof SessionTokenV1, 'to be true');
      expect(session, 'to satisfy', {
        userId: luna.id,
        issue: 1,
        status: ACTIVE,
        createdAt: expect.it('to be close to', now),
        updatedAt: expect.it('to be close to', now),
        lastUsedAt: expect.it('to be close to', now),
        databaseTime: expect.it('to be close to', now),
      });
    });

    it('should load session by id', async () => {
      const s2 = await sessionTokenV1Store.getById(session.id);
      expect(s2 instanceof SessionTokenV1, 'to be true');
      expect(s2, 'to satisfy', _.pick(session, ['id', 'userId', 'issue', 'status']));
    });

    it('should reissue session', async () => {
      const { issue } = session;
      const ok = await session.reissue();
      expect(ok, 'to be true');
      expect(session.issue, 'to be', issue + 1);

      const s2 = await sessionTokenV1Store.getById(session.id);
      expect(s2 instanceof SessionTokenV1, 'to be true');
      expect(s2, 'to satisfy', _.pick(session, ['id', 'userId', 'issue']));
    });

    it('should set session status', async () => {
      const ok = await session.setStatus(CLOSED);
      expect(ok, 'to be true');
      expect(session.status, 'to be', CLOSED);

      const s2 = await sessionTokenV1Store.getById(session.id);
      expect(s2 instanceof SessionTokenV1, 'to be true');
      expect(s2.status, 'to be', CLOSED);

      await session.setStatus(ACTIVE);
    });

    it('should delete session', async () => {
      const { id } = await sessionTokenV1Store.create(luna.id);

      const s = await sessionTokenV1Store.getById(id);
      expect(s, 'not to be null');

      const deleted = await s.destroy();
      expect(deleted, 'to be true');

      const s1 = await sessionTokenV1Store.getById(id);
      expect(s1, 'to be null');
    });

    describe(`Old sessions cleanup`, () => {
      before(() => cleanDB($pg_database));

      let session1, session2, jobId, jobManager;

      before(async () => {
        luna = new User({ username: 'luna', password: 'pw' });
        await luna.create();

        session1 = await sessionTokenV1Store.create(luna.id);
        session2 = await sessionTokenV1Store.create(luna.id);

        await dbAdapter.database.raw(
          `update auth_sessions set last_used_at = now() - :time * '1 day'::interval where uid = :uid`,
          { uid: session2.id, time: config.authSessions.activeSessionTTLDays + 1 },
        );

        jobManager = await initJobProcessing();
      });

      it(`should create periodic job that cleaned up sessions`, async () => {
        const jobs = await dbAdapter.getAllJobs([PERIODIC_CLEAN_AUTH_SESSIONS]);
        expect(jobs, 'to satisfy', [{ name: PERIODIC_CLEAN_AUTH_SESSIONS }]);
        jobId = jobs[0].id;
      });

      it(`should remove session when job completed`, async () => {
        const job = await Job.getById(jobId);
        await job.setUnlockAt(0);

        {
          const sessions = await sessionTokenV1Store.list(luna.id);
          expect(sessions, 'to satisfy', [{ id: session2.id }, { id: session1.id }]);
        }

        await jobManager.fetchAndProcess();

        {
          const sessions = await sessionTokenV1Store.list(luna.id);
          expect(sessions, 'to satisfy', [{ id: session1.id }]);
        }
      });
    });
  });
});
