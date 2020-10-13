/* eslint-env node, mocha */
/* global $pg_database */
import { promises as fs } from 'fs';
import path from 'path';

import config from 'config';
import fetch from 'node-fetch'
import expect from 'unexpected'

import { getSingleton } from '../../app/app'
import { version as serverVersion } from '../../package.json';
import cleanDB from '../dbCleaner';

import { createTestUser, updateUserAsync } from './functional_test_helper';


describe('Common API routing', () => {
  let app

  before(async () => {
    app = await getSingleton()
  })

  it(`should publish the X-Freefeed-Server (server version) and Date response header`, async () => {
    const resp = await fetch(`${app.context.config.host}/v2/users/whoami`);
    expect(resp.status, 'to be', 401);
    expect(resp.headers.get('X-Freefeed-Server'), 'to be', serverVersion);
    expect(resp.headers.get('Access-Control-Expose-Headers'), 'to contain', 'X-Freefeed-Server');
    expect(resp.headers.get('Access-Control-Expose-Headers'), 'to contain', 'Date');
  });

  it(`should publish the Server-Timing response header`, async () => {
    const resp = await fetch(`${app.context.config.host}/v2/server-info`);
    expect(resp.headers.get('Server-Timing'), 'to satisfy', /total;dur=\d/);
  });

  it(`should return error if API method is not exists`, async () => {
    const resp = await fetch(`${app.context.config.host}/v1/unexisting/method`);
    expect(resp.status, 'to be', 404);
    const respData = await resp.json();
    expect(respData, 'to satisfy', { err: 'API method not found: \'/v1/unexisting/method\'' });
  });

  it(`should response '200 OK' to OPTIONS request`, async () => {
    const resp = await fetch(`${app.context.config.host}/v2/users/whoami`, { method: 'OPTIONS' });
    expect(resp.status, 'to be', 200);
  });

  it(`should response '200 OK' to OPTIONS request if API method is not exists`, async () => {
    const resp = await fetch(`${app.context.config.host}/v1/unexisting/method`, { method: 'OPTIONS' });
    expect(resp.status, 'to be', 200);
  });

  it('should normalize unicode strings in request', async () => {
    await cleanDB($pg_database);
    const newName = 'François I. de Clèves';
    const user = await createTestUser();
    const result = await updateUserAsync(user, { screenName: newName.normalize('NFD') }).then((r) => r.json());
    expect(result.users.screenName, 'to be', newName.normalize('NFC'));
  });

  it(`should response '503 Service Unavailable' if MAINTENANCE.txt is exists`, async () => {
    const { messageFile } = config.maintenance;

    await fs.mkdir(path.dirname(messageFile), { recursive: true });
    await fs.writeFile(messageFile, 'Maintenance message', { flag: 'w' });

    try {
      const resp = await fetch(`${app.context.config.host}/v1/unexisting/method`);
      expect(resp.status, 'to be', 503);
      const respData = await resp.json();
      expect(respData, 'to satisfy', { err: 'Maintenance message', errType: 'ServiceUnavailable.Maintenance' });
    } finally {
      await fs.unlink(messageFile);
    }
  });

  it(`should response '200 OK' for OPRIONS requests even if MAINTENANCE.txt is exists`, async () => {
    const { messageFile } = config.maintenance;

    await fs.mkdir(path.dirname(messageFile), { recursive: true });
    await fs.writeFile(messageFile, 'Maintenance message', { flag: 'w' });

    try {
      const resp = await fetch(`${app.context.config.host}/v1/unexisting/method`, { method: 'OPTIONS' });
      expect(resp.status, 'to be', 200);
    } finally {
      await fs.unlink(messageFile);
    }
  });
});
