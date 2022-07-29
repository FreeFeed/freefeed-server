/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../dbCleaner';

import {
  authHeaders,
  createGroupAsync,
  createTestUsers,
  performJSONRequest,
  promoteToAdmin,
  subscribeToAsync,
  updateGroupAsync,
} from './functional_test_helper';

describe('Group acceptsPosts field', () => {
  beforeEach(() => cleanDB($pg_database));

  let luna, mars, venus, jupiter, selenites;

  beforeEach(async () => {
    [luna, mars, venus, jupiter] = await createTestUsers(['luna', 'mars', ' venus', 'jupiter']);
    selenites = await createGroupAsync(luna, 'selenites');
    await Promise.all([
      subscribeToAsync(mars, selenites),
      subscribeToAsync(venus, selenites),
      promoteToAdmin(selenites, luna, venus),
    ]);
  });

  it(`should show acceptsPosts: true for all users for public group`, async () => {
    expect(await getUserInfo(selenites, luna), 'to satisfy', { acceptsPosts: true });
    expect(await getUserInfo(selenites, mars), 'to satisfy', { acceptsPosts: true });
    expect(await getUserInfo(selenites, venus), 'to satisfy', { acceptsPosts: true });
    expect(await getUserInfo(selenites, jupiter), 'to satisfy', { acceptsPosts: true });
  });

  it(`should show acceptsPosts: true for all users for protected group`, async () => {
    await updateGroupAsync(selenites.group, luna, { isProtected: '1' });
    expect(await getUserInfo(selenites, luna), 'to satisfy', { acceptsPosts: true });
    expect(await getUserInfo(selenites, mars), 'to satisfy', { acceptsPosts: true });
    expect(await getUserInfo(selenites, venus), 'to satisfy', { acceptsPosts: true });
    expect(await getUserInfo(selenites, jupiter), 'to satisfy', { acceptsPosts: true });
  });

  it(`should show acceptsPosts: true only for members of private group`, async () => {
    await updateGroupAsync(selenites.group, luna, { isPrivate: '1' });
    expect(await getUserInfo(selenites, luna), 'to satisfy', { acceptsPosts: true });
    expect(await getUserInfo(selenites, mars), 'to satisfy', { acceptsPosts: true });
    expect(await getUserInfo(selenites, venus), 'to satisfy', { acceptsPosts: true });
    expect(await getUserInfo(selenites, jupiter), 'to satisfy', { acceptsPosts: false });
  });

  it(`should show acceptsPosts: true only for admins of restricted group`, async () => {
    await updateGroupAsync(selenites.group, luna, { isRestricted: '1' });
    expect(await getUserInfo(selenites, luna), 'to satisfy', { acceptsPosts: true });
    expect(await getUserInfo(selenites, mars), 'to satisfy', { acceptsPosts: false });
    expect(await getUserInfo(selenites, venus), 'to satisfy', { acceptsPosts: true });
    expect(await getUserInfo(selenites, jupiter), 'to satisfy', { acceptsPosts: false });
  });

  describe('Mars is blocked in group', () => {
    beforeEach(() => blockUserInGroup(mars, selenites, luna));

    it(`should show acceptsPosts: true for all users (except Mars) for public group`, async () => {
      expect(await getUserInfo(selenites, luna), 'to satisfy', { acceptsPosts: true });
      expect(await getUserInfo(selenites, mars), 'to satisfy', { acceptsPosts: false });
      expect(await getUserInfo(selenites, venus), 'to satisfy', { acceptsPosts: true });
      expect(await getUserInfo(selenites, jupiter), 'to satisfy', { acceptsPosts: true });
    });

    it(`should show acceptsPosts: true for all users (except Mars) for protected group`, async () => {
      await updateGroupAsync(selenites.group, luna, { isProtected: '1' });
      expect(await getUserInfo(selenites, luna), 'to satisfy', { acceptsPosts: true });
      expect(await getUserInfo(selenites, mars), 'to satisfy', { acceptsPosts: false });
      expect(await getUserInfo(selenites, venus), 'to satisfy', { acceptsPosts: true });
      expect(await getUserInfo(selenites, jupiter), 'to satisfy', { acceptsPosts: true });
    });

    it(`should show acceptsPosts: true only for members (except Mars) of private group`, async () => {
      await updateGroupAsync(selenites.group, luna, { isPrivate: '1' });
      expect(await getUserInfo(selenites, luna), 'to satisfy', { acceptsPosts: true });
      expect(await getUserInfo(selenites, mars), 'to satisfy', { acceptsPosts: false });
      expect(await getUserInfo(selenites, venus), 'to satisfy', { acceptsPosts: true });
      expect(await getUserInfo(selenites, jupiter), 'to satisfy', { acceptsPosts: false });
    });

    it(`should show acceptsPosts: true only for admins of restricted group`, async () => {
      await updateGroupAsync(selenites.group, luna, { isRestricted: '1' });
      expect(await getUserInfo(selenites, luna), 'to satisfy', { acceptsPosts: true });
      expect(await getUserInfo(selenites, mars), 'to satisfy', { acceptsPosts: false });
      expect(await getUserInfo(selenites, venus), 'to satisfy', { acceptsPosts: true });
      expect(await getUserInfo(selenites, jupiter), 'to satisfy', { acceptsPosts: false });
    });
  });
});

function getUserInfo(groupCtx, ctx) {
  return performJSONRequest('GET', `/v1/users/${groupCtx.username}`, null, authHeaders(ctx));
}

function blockUserInGroup(user, group, admin) {
  return performJSONRequest(
    'POST',
    `/v2/groups/${group.username}/block/${user.username}`,
    {},
    authHeaders(admin),
  );
}
