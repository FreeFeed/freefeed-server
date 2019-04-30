/* eslint-env node, mocha */
/* global $pg_database */
import fetch from 'node-fetch'
import expect from 'unexpected'

import cleanDB from '../dbCleaner'
import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub, User } from '../../app/models'

import { sessionRequest } from './functional_test_helper';


describe('SessionController', () => {
  let app;

  before(async () => {
    app = await getSingleton();
    PubSub.setPublisher(new DummyPublisher());
  })

  beforeEach(() => cleanDB($pg_database));

  describe('#create()', () => {
    let user, userData;

    beforeEach(async () => {
      userData = {
        username: 'Luna',
        password: 'password',
        email:    'luna@luna.space',
      }
      user = new User(userData);
      await user.create();
    })

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
      expect(respBody, 'to satisfy', { err: 'The password you provided does not match the password in our system.' });
    });

    it('should not sign in with missing username', async () => {
      const result = await fetch(`${app.context.config.host}/v1/session`, { method: 'POST', body: 'a=1' });
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
      expect(respBody, 'to satisfy', { err: 'The password you provided does not match the password in our system.' });
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
      expect(respBody, 'to satisfy', { err: 'The password you provided does not match the password in our system.' });
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
  });
});
