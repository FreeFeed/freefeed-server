/* eslint-env node, mocha */
import expect from 'unexpected';

import { version as serverVersion } from '../../package.json';
import { allExternalProviders } from '../../app/support/ExtAuth';

import { serverInfoResponse } from './schemaV2-helper';
import { performJSONRequest } from './functional_test_helper';

describe('/v2/server-info', () => {
  it(`should return the correct structure of response`, async () => {
    const resp = await performJSONRequest('GET', `/v2/server-info`);
    expect(resp.__httpCode, 'to be', 200);
    expect(resp, 'to satisfy', serverInfoResponse);
  });

  it(`should return the server version`, async () => {
    const resp = await performJSONRequest('GET', `/v2/server-info`);
    expect(resp.version, 'to be', serverVersion);
  });

  it(`should return the externalAuthProviders`, async () => {
    const resp = await performJSONRequest('GET', `/v2/server-info`);
    const externalAuthProvidersInfo = allExternalProviders.map(({ id, title, brand = id }) => ({
      id,
      title,
      brand,
    }));
    expect(resp.externalAuthProvidersInfo, 'to equal', externalAuthProvidersInfo);
    expect(
      resp.externalAuthProviders,
      'to equal',
      externalAuthProvidersInfo.map((p) => p.id),
    );
  });
});
