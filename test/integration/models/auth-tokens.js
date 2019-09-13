/* eslint-env node, mocha */
/* global $pg_database */
import _ from 'lodash';
import unexpected from 'unexpected';
import unexpectedDate from 'unexpected-date';
import jwt from 'jsonwebtoken';

import cleanDB from '../../dbCleaner';
import { User, SessionTokenV0, AppTokenV1, dbAdapter } from '../../../app/models';
import { load as configLoader } from '../../../config/config';

const expect = unexpected.clone();
expect.use(unexpectedDate);

const config = configLoader();

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
      expect(token.hasFullAccess(), 'to be true');
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
        token = new AppTokenV1({
          userId: luna.id,
          title: 'My app',
          scopes: ['read-my-info', 'manage-posts'],
          restrictions: {
            netmasks: ['127.0.0.1/24'],
            origins: ['https://localhost'],
          },
        });
        await token.create();
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
        const t = new AppTokenV1({
          userId: luna.id,
          title: 'My app',
        });
        await t.create();
        expect(t.isActive, 'to be true');
        await t.inactivate();
        expect(t.isActive, 'to be false');
      });

      it('should not load inactive token', async () => {
        const t = new AppTokenV1({
          userId: luna.id,
          title: 'My app',
        });
        await t.create();
        await t.inactivate();
        const t2 = await dbAdapter.getActiveAppTokenByIdAndIssue(t.id, t.issue);
        expect(t2, 'to be null');
      });

      it('should not have full access', () => {
        expect(token.hasFullAccess(), 'to be false');
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

        const t2 = await dbAdapter.getAppTokenById(token.id);
        expect(new Date(t2.lastUsedAt), 'to be close to', new Date());
        expect(t2.lastIP, 'to be', ip);
        expect(t2.lastUserAgent, 'to be', userAgent);
      });

      describe('logRequest', () => {
        beforeEach(() => $pg_database.raw('delete from app_tokens_log'));

        it('should write log entry after POST request', async () => {
          const ctx = {
            ip: '127.0.0.127',
            method: 'POST',
            url: '/v1/posts',
            _matchedRoute: '/v1/posts',
            headers: {
              'user-agent': 'Lynx browser, Linux',
              'x-real-ip': '127.0.0.128',
              origin: 'https://localhost',
            },
            state: {},
          };

          ctx.state.appTokenLogPayload = { postId: 'post1' };
          await token.logRequest(ctx);

          const { rows: logRows } = await $pg_database.raw(
            'select * from app_tokens_log where token_id = :id limit 1',
            { id: token.id },
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

        it('should not write log entry after GET request', async () => {
          const ctx = {
            ip: '127.0.0.127',
            method: 'GET', // <-- here
            url: '/v1/posts',
            _matchedRoute: '/v1/posts',
            headers: {
              'user-agent': 'Lynx browser, Linux',
              'x-real-ip': '127.0.0.128',
              origin: 'https://localhost',
            },
            state: {},
          };

          ctx.state.appTokenLogPayload = { postId: 'post1' };
          await token.logRequest(ctx);

          const { rows: logRows } = await $pg_database.raw(
            'select * from app_tokens_log where token_id = :id limit 1',
            { id: token.id },
          );
          expect(logRows, 'to be empty');
        });

        it('should not write log entry after unsuccessful request', async () => {
          const ctx = {
            ip: '127.0.0.127',
            method: 'POST',
            url: '/v1/posts',
            _matchedRoute: '/v1/posts',
            headers: {
              'user-agent': 'Lynx browser, Linux',
              'x-real-ip': '127.0.0.128',
              origin: 'https://localhost',
            },
            state: {},
            status: 422, // <-- here
          };

          ctx.state.appTokenLogPayload = { postId: 'post1' };
          await token.logRequest(ctx);

          const { rows: logRows } = await $pg_database.raw(
            'select * from app_tokens_log where token_id = :id limit 1',
            { id: token.id },
          );
          expect(logRows, 'to be empty');
        });
      });
    });
  });
});
