/* eslint-env node, mocha */
import fetch from 'node-fetch'
import expect from 'unexpected'

import { getSingleton } from '../../app/app'
import { version as serverVersion } from '../../package.json';


describe('Server version header', () => {
  let app

  before(async () => {
    app = await getSingleton()
  })

  it(`should publish the X-Freefeed-Server response header`, async () => {
    const resp = await fetch(`${app.context.config.host}/v2/users/whoami`);
    expect(resp.status, 'to be', 401);
    expect(resp.headers.get('X-Freefeed-Server'), 'to be', serverVersion);
    expect(resp.headers.get('Access-Control-Expose-Headers'), 'to contain', 'X-Freefeed-Server');
  });
});
