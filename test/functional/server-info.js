/* eslint-env node, mocha */
import fetch from 'node-fetch';
import expect from 'unexpected';
import config from 'config';

import { getSingleton } from '../../app/app';
import { version as serverVersion } from '../../package.json';

import { serverInfoResponse } from './schemaV2-helper';


describe('/v2/server-info', () => {
  let host;

  before(async () => {
    const app = await getSingleton();
    ({ host } = app.context.config);
  });

  it(`should return the correct structure of response`, async () => {
    const resp = await fetch(`${host}/v2/server-info`);
    expect(resp.status, 'to be', 200);
    const data = await resp.json();
    expect(data, 'to satisfy', serverInfoResponse);
  });

  it(`should return the server version`, async () => {
    const resp = await fetch(`${host}/v2/server-info`).then((r) => r.json());
    expect(resp.version, 'to be', serverVersion);
  });

  it(`should return the externalAuthProviders`, async () => {
    const resp = await fetch(`${host}/v2/server-info`).then((r) => r.json());
    const externalAuthProviders = Object.keys(config.externalAuthProviders || {});
    expect(resp.externalAuthProviders.sort(), 'to equal', externalAuthProviders.sort());
  });
});
