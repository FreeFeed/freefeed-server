/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../dbCleaner';

import {
  authHeaders,
  createGroupAsync,
  createTestUsers,
  performJSONRequest,
} from './functional_test_helper';

describe('Groups without bans', () => {
  /** @type {import('../../app/models').User} */
  let luna;
  /** @type {import('../../app/models').User} */
  let mars;
  /** @type {import('../../app/models').Group} */
  let selenites;

  beforeEach(() => cleanDB($pg_database));

  beforeEach(async () => {
    [luna, mars] = await createTestUsers(['luna', 'mars']);
    selenites = await createGroupAsync(luna, 'selenites');
  });

  it(`should return 'disable_bans' in 'youCan' for Mars`, async () => {
    const resp = await performJSONRequest(
      'GET',
      `/v1/users/${selenites.username}`,
      null,
      authHeaders(mars),
    );
    expect(resp.users.youCan, 'to contain', 'disable_bans');
  });

  it(`should disable bans in Selenites`, async () => {
    const resp = await performJSONRequest(
      'POST',
      `/v2/groups/${selenites.username}/disableBans`,
      {},
      authHeaders(mars),
    );
    expect(resp.users.youCan, 'to contain', 'undisable_bans');
  });

  it(`should re-enable disabled bans in Selenites`, async () => {
    let resp = await performJSONRequest(
      'POST',
      `/v2/groups/${selenites.username}/disableBans`,
      {},
      authHeaders(mars),
    );
    expect(resp.users.youCan, 'to contain', 'undisable_bans');

    resp = await performJSONRequest(
      'POST',
      `/v2/groups/${selenites.username}/enableBans`,
      {},
      authHeaders(mars),
    );
    expect(resp.users.youCan, 'to contain', 'disable_bans');
  });
});
