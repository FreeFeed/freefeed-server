/* eslint-env node, mocha */
/* global $pg_database */
import unexpected from 'unexpected';
import unexpectedDate from 'unexpected-date';
import unexpectedSinon from 'unexpected-sinon';

import cleanDB from '../../dbCleaner';
import { User, sessionTokenV1Store } from '../../../app/models';
import { withJWT } from '../../../app/controllers/middlewares/with-jwt';

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

  describe('Token sources', () => {
    let authToken;
    before(async () => (authToken = (await sessionTokenV1Store.create(luna.id)).tokenString()));

    const ctxBase = { query: {}, request: { body: {} }, headers: {}, state: {}, ip: '127.0.0.127' };

    it('should accept token in ctx.query.authToken', async () => {
      const ctx = { ...ctxBase, query: { authToken } };
      await withJWT(ctx, () => null);
      expect(ctx.state, 'to satisfy', { authJWTPayload: { userId: luna.id } });
    });

    it('should accept token in ctx.request.body.authToken', async () => {
      const ctx = { ...ctxBase, request: { body: { authToken } } };
      await withJWT(ctx, () => null);
      expect(ctx.state, 'to satisfy', { authJWTPayload: { userId: luna.id } });
    });

    it(`should accept token in 'x-authentication-token' header`, async () => {
      const ctx = { ...ctxBase, headers: { 'x-authentication-token': authToken } };
      await withJWT(ctx, () => null);
      expect(ctx.state, 'to satisfy', { authJWTPayload: { userId: luna.id } });
    });

    it(`should accept token in 'authorization' header`, async () => {
      const ctx = { ...ctxBase, headers: { authorization: `Bearer ${authToken}` } };
      await withJWT(ctx, () => null);
      expect(ctx.state, 'to satisfy', { authJWTPayload: { userId: luna.id } });
    });

    it(`should not accept invalid in 'authorization' header`, async () => {
      const ctx = { ...ctxBase, headers: { authorization: `BeaRER ${authToken}` } };
      await expect(
        withJWT(ctx, () => null),
        'to be rejected with',
        { status: 401 },
      );
    });
  });
});
