/* eslint-env node, mocha */
/* global $database, $pg_database */
import fetch from 'node-fetch';
import expect from 'unexpected';
import config from 'config';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

import cleanDB from '../dbCleaner';
import { getSingleton } from '../../app/app';
import {
  AuthToken,
  dbAdapter,
  PubSub,
  SessionTokenV1,
  sessionTokenV1Store,
  User,
} from '../../app/models';
import { PubSubAdapter } from '../../app/support/PubSubAdapter';

import { sessionRequest, performJSONRequest } from './functional_test_helper';
import Session from './realtime-session';

describe('SessionController', () => {
  let app;
  let port;

  before(async () => {
    app = await getSingleton();
    port = process.env.PEPYATKA_SERVER_PORT || app.context.config.port;
    const pubsubAdapter = new PubSubAdapter($database);
    PubSub.setPublisher(pubsubAdapter);
  });

  beforeEach(() => cleanDB($pg_database));

  describe('#create()', () => {
    let user, userData;

    beforeEach(async () => {
      userData = {
        username: 'Luna',
        password: 'password',
        email: 'luna@luna.space',
      };
      user = new User(userData);
      await user.create();
    });

    it('should sign in with a valid user', async () => {
      const resp = await sessionRequest(userData.username, userData.password);
      expect(resp.status, 'to equal', 200);
      const respBody = await resp.json();
      expect(respBody, 'to satisfy', { users: { id: user.id } });
    });

    it('should not sign in with an invalid user', async () => {
      const resp = await sessionRequest('username', userData.password);
      expect(resp.status, 'to equal', 401);
      const respBody = await resp.json();
      expect(respBody, 'to satisfy', { err: 'We could not find the nickname you provided.' });
    });

    it('should not sign in with an invalid password', async () => {
      const resp = await sessionRequest(userData.username, 'wrong');
      expect(resp.status, 'to equal', 401);
      const respBody = await resp.json();
      expect(respBody, 'to satisfy', {
        err: 'The password you provided does not match the password in our system.',
      });
    });

    it('should not sign in with missing username', async () => {
      const result = await fetch(`${app.context.config.host}/v1/session`, {
        method: 'POST',
        body: 'a=1',
      });
      const data = await result.json();
      expect(data, 'not to have key', 'authToken');
      expect(data, 'to have key', 'err');
    });

    it('should sign in with an altered-case username', async () => {
      const resp = await sessionRequest('lUnA', userData.password);
      expect(resp.status, 'to equal', 200);
      const respBody = await resp.json();
      expect(respBody, 'to satisfy', { users: { id: user.id } });
    });

    it('should not sign in with an altered-case password', async () => {
      const resp = await sessionRequest(userData.username, 'passWorD');
      expect(resp.status, 'to equal', 401);
      const respBody = await resp.json();
      expect(respBody, 'to satisfy', {
        err: 'The password you provided does not match the password in our system.',
      });
    });

    it('should sign in with a spaces around username', async () => {
      const resp = await sessionRequest(` ${userData.username} `, userData.password);
      expect(resp.status, 'to equal', 200);
      const respBody = await resp.json();
      expect(respBody, 'to satisfy', { users: { id: user.id } });
    });

    it('should not sign in with a spaces around password', async () => {
      const resp = await sessionRequest(userData.username, ` ${userData.password} `);
      expect(resp.status, 'to equal', 401);
      const respBody = await resp.json();
      expect(respBody, 'to satisfy', {
        err: 'The password you provided does not match the password in our system.',
      });
    });

    it('should sign in with a email instead of username', async () => {
      const resp = await sessionRequest(userData.email, userData.password);
      expect(resp.status, 'to equal', 200);
      const respBody = await resp.json();
      expect(respBody, 'to satisfy', { users: { id: user.id } });
    });

    it('should sign in with an altered-case email', async () => {
      const resp = await sessionRequest('lUnA@luna.space', userData.password);
      expect(resp.status, 'to equal', 200);
      const respBody = await resp.json();
      expect(respBody, 'to satisfy', { users: { id: user.id } });
    });

    it('should sign in with a spaces around email', async () => {
      const resp = await sessionRequest(` ${userData.email} `, userData.password);
      expect(resp.status, 'to equal', 200);
      const respBody = await resp.json();
      expect(respBody, 'to satisfy', { users: { id: user.id } });
    });

    it('should create a SessionTokenV1 type session', async () => {
      const resp = await sessionRequest(` ${userData.email} `, userData.password);
      const { authToken } = await resp.json();
      const payload = jwt.decode(authToken);
      expect(payload, 'to satisfy', {
        type: SessionTokenV1.TYPE,
        id: expect.it('to be a string'),
        issue: 1,
        userId: user.id,
      });
    });
  });

  describe('#close', () => {
    let user, session;

    beforeEach(async () => {
      user = new User({ username: 'Luna', password: 'password' });
      await user.create();
      session = await sessionTokenV1Store.create(user.id);
    });

    it(`should not allow to close session without authentication`, async () => {
      const resp = await performJSONRequest('DELETE', '/v1/session');
      expect(resp, 'to satisfy', { __httpCode: 401 });
    });

    it(`should close the V1 session`, async () => {
      const resp = await performJSONRequest('DELETE', '/v1/session', null, authHeaders(session));

      expect(resp, 'to satisfy', { __httpCode: 200, closed: true });
    });

    it(`should not allow to use session after close`, async () => {
      await performJSONRequest('DELETE', '/v1/session', null, authHeaders(session));

      const resp = await performJSONRequest('GET', '/v1/users/me', null, authHeaders(session));

      expect(resp, 'to satisfy', { __httpCode: 401 });
    });
  });

  describe('#reissue', () => {
    let user, session;

    beforeEach(async () => {
      user = new User({ username: 'Luna', password: 'password' });
      await user.create();
      session = await sessionTokenV1Store.create(user.id);
    });

    it(`should allow to reissue session`, async () => {
      const oldToken = session.tokenString();
      const resp = await performJSONRequest(
        'POST',
        '/v1/session/reissue',
        null,
        authHeaders(oldToken),
      );

      expect(resp, 'to satisfy', {
        __httpCode: 200,
        authToken: expect.it('to be a string'),
        reissued: true,
      });
      const newToken = resp.authToken;

      // Both tokens should works
      await expect(
        performJSONRequest('GET', '/v1/users/me', null, authHeaders(oldToken)),
        'to be fulfilled with',
        { __httpCode: 200 },
      );

      await expect(
        performJSONRequest('GET', '/v1/users/me', null, authHeaders(newToken)),
        'to be fulfilled with',
        { __httpCode: 200 },
      );
    });

    it(`should block access with the stale token`, async () => {
      const oldToken = session.tokenString();
      const { authToken: newToken } = await performJSONRequest(
        'POST',
        '/v1/session/reissue',
        null,
        authHeaders(oldToken),
      );

      const nowDate = new Date(await dbAdapter.now());

      // Make the old token stale
      const updatedAt = new Date(
        nowDate.getTime() - 1000 * (config.authSessions.reissueGraceIntervalSec + 10),
      );
      await dbAdapter.updateAuthSession(session.id, { updatedAt });

      // New token should work
      await expect(
        performJSONRequest('GET', '/v1/users/me', null, authHeaders(newToken)),
        'to be fulfilled with',
        { __httpCode: 200 },
      );

      // Old token should not work...
      await expect(
        performJSONRequest('GET', '/v1/users/me', null, authHeaders(oldToken)),
        'to be fulfilled with',
        { __httpCode: 401 },
      );
    });

    it(`should allow to reauthorize realtime session`, async () => {
      const oldToken = session.tokenString();
      const { authToken: newToken } = await performJSONRequest(
        'POST',
        '/v1/session/reissue',
        null,
        authHeaders(oldToken),
      );

      const createPost = () =>
        performJSONRequest(
          'POST',
          '/v1/posts',
          { post: { body: 'body' }, meta: { feeds: 'luna' } },
          authHeaders(oldToken),
        );

      // Luna is private user
      await user.update({ isPrivate: '1' });

      const rtSession = await Session.create(port, 'Luna session');
      await rtSession.sendAsync('auth', { authToken: oldToken });

      // Subscribe to Luna's feed
      const feed = await dbAdapter.getUserNamedFeed(user.id, 'Posts');
      await rtSession.sendAsync('subscribe', { timeline: [feed.id] });

      await expect(rtSession.receiveWhile('post:new', createPost), 'to be fulfilled');

      // Re-auth the RT session
      await rtSession.sendAsync('auth', { authToken: newToken });

      await expect(rtSession.receiveWhile('post:new', createPost), 'to be fulfilled');

      // Log out from the RT session
      await rtSession.sendAsync('auth', { authToken: '' });

      await expect(rtSession.notReceiveWhile('post:new', createPost), 'to be fulfilled');
    });
  });

  describe('#list', () => {
    let user, sessionA, sessionB;

    beforeEach(async () => {
      user = new User({ username: 'Luna', password: 'password' });
      await user.create();
      sessionA = await sessionTokenV1Store.create(user.id);
      sessionB = await sessionTokenV1Store.create(user.id);
    });

    it('should return list of sessions', async () => {
      await expect(
        performJSONRequest('GET', '/v1/session/list', null, authHeaders(sessionA)),
        'to be fulfilled with',
        {
          __httpCode: 200,
          current: sessionA.id,
          sessions: [
            { id: sessionB.id, status: 'ACTIVE' },
            { id: sessionA.id, status: 'ACTIVE' },
          ],
        },
      );
    });

    it(`should return closed sessions in list`, async () => {
      await performJSONRequest('DELETE', '/v1/session', null, authHeaders(sessionB));
      await expect(
        performJSONRequest('GET', '/v1/session/list', null, authHeaders(sessionA)),
        'to be fulfilled with',
        {
          __httpCode: 200,
          current: sessionA.id,
          sessions: [
            { id: sessionB.id, status: 'CLOSED' },
            { id: sessionA.id, status: 'ACTIVE' },
          ],
        },
      );
    });
  });

  describe('#updateList', () => {
    let user, sessionA, sessionB, sessionC;

    beforeEach(async () => {
      user = new User({ username: 'Luna', password: 'password' });
      await user.create();
      sessionA = await sessionTokenV1Store.create(user.id);
      sessionB = await sessionTokenV1Store.create(user.id);
      sessionC = await sessionTokenV1Store.create(user.id);
    });

    it('should close sessions by IDs', async () => {
      await expect(
        performJSONRequest(
          'PATCH',
          '/v1/session/list',
          { close: [sessionB.id, sessionC.id] },
          authHeaders(sessionA),
        ),
        'to be fulfilled with',
        {
          __httpCode: 200,
          current: sessionA.id,
          sessions: [
            { id: sessionC.id, status: 'CLOSED' },
            { id: sessionB.id, status: 'CLOSED' },
            { id: sessionA.id, status: 'ACTIVE' },
          ],
        },
      );
    });

    it('should close the current session by ID', async () => {
      await expect(
        performJSONRequest(
          'PATCH',
          '/v1/session/list',
          { close: [sessionA.id, sessionB.id] },
          authHeaders(sessionA),
        ),
        'to be fulfilled with',
        {
          __httpCode: 200,
          current: sessionA.id,
          sessions: [
            { id: sessionC.id, status: 'ACTIVE' },
            { id: sessionB.id, status: 'CLOSED' },
            { id: sessionA.id, status: 'CLOSED' },
          ],
        },
      );
    });

    it('should not close sessions by invalid IDs', async () => {
      await expect(
        performJSONRequest(
          'PATCH',
          '/v1/session/list',
          { close: [uuidv4(), uuidv4()] },
          authHeaders(sessionA),
        ),
        'to be fulfilled with',
        {
          __httpCode: 200,
          current: sessionA.id,
          sessions: [
            { id: sessionC.id, status: 'ACTIVE' },
            { id: sessionB.id, status: 'ACTIVE' },
            { id: sessionA.id, status: 'ACTIVE' },
          ],
        },
      );
    });
  });
});

function authHeaders(session) {
  return {
    Authorization: `Bearer ${session instanceof AuthToken ? session.tokenString() : session}`,
  };
}
