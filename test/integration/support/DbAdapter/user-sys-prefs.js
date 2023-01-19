/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../../../dbCleaner';
import { User, dbAdapter } from '../../../../app/models';

describe('get/setUserSysPrefs', () => {
  before(() => cleanDB($pg_database));

  /** @type {User} */
  let luna;
  before(async () => {
    luna = new User({ username: 'luna', password: 'pw' });
    await luna.create();
  });

  it(`should return default pref value`, async () => {
    const v = await dbAdapter.getUserSysPrefs(luna.id, 'foo', 'bar');
    expect(v, 'to be', 'bar');
  });

  it(`should set / get string value`, async () => {
    await dbAdapter.setUserSysPrefs(luna.id, 'foo', 'bar');
    const v = await dbAdapter.getUserSysPrefs(luna.id, 'foo', null);
    expect(v, 'to be', 'bar');
  });

  it(`should set / get number value`, async () => {
    await dbAdapter.setUserSysPrefs(luna.id, 'foo', 42);
    const v = await dbAdapter.getUserSysPrefs(luna.id, 'foo', null);
    expect(v, 'to be', 42);
  });

  it(`should set / get complex value`, async () => {
    await dbAdapter.setUserSysPrefs(luna.id, 'foo', [42, 'bar']);
    const v = await dbAdapter.getUserSysPrefs(luna.id, 'foo', null);
    expect(v, 'to equal', [42, 'bar']);
  });

  it(`should set / get null value`, async () => {
    await dbAdapter.setUserSysPrefs(luna.id, 'foo', null);
    const v = await dbAdapter.getUserSysPrefs(luna.id, 'foo', 'bar');
    expect(v, 'to be null');
  });
});
