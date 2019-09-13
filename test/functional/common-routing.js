/* eslint-env node, mocha */
import fetch from 'node-fetch';
import expect from 'unexpected';

import { getSingleton } from '../../app/app';
import { version as serverVersion } from '../../package.json';

describe('Common API routing', () => {
  let app;

  before(async () => {
    app = await getSingleton();
  });

  it(`should publish the X-Freefeed-Server (server version) and Date response header`, async () => {
    const resp = await fetch(`${app.context.config.host}/v2/users/whoami`);
    expect(resp.status, 'to be', 401);
    expect(resp.headers.get('X-Freefeed-Server'), 'to be', serverVersion);
    expect(resp.headers.get('Access-Control-Expose-Headers'), 'to contain', 'X-Freefeed-Server');
    expect(resp.headers.get('Access-Control-Expose-Headers'), 'to contain', 'Date');
  });

  it(`should return error if API method is not exists`, async () => {
    const resp = await fetch(`${app.context.config.host}/v1/unexisting/method`);
    expect(resp.status, 'to be', 404);
    const respData = await resp.json();
    expect(respData, 'to satisfy', { err: "API method not found: '/v1/unexisting/method'" });
  });

  it(`should response '200 OK' to OPTIONS request`, async () => {
    const resp = await fetch(`${app.context.config.host}/v2/users/whoami`, { method: 'OPTIONS' });
    expect(resp.status, 'to be', 200);
  });

  it(`should response '404 Not Found' to OPTIONS request if API method is not exists`, async () => {
    const resp = await fetch(`${app.context.config.host}/v1/unexisting/method`, {
      method: 'OPTIONS',
    });
    expect(resp.status, 'to be', 404);
  });
});
