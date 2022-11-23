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

describe(`Group 'youCan' field`, () => {
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

  it(`should allow 'post' for all authorized users for public group`, async () => {
    expect(await getUserInfo(selenites), 'to satisfy', {
      users: { youCan: expect.it('not to contain', 'post') },
    });
    expect(await getUserInfo(selenites, luna), 'to satisfy', {
      users: { youCan: expect.it('to contain', 'post') },
    });
    expect(await getUserInfo(selenites, mars), 'to satisfy', {
      users: { youCan: expect.it('to contain', 'post') },
    });
    expect(await getUserInfo(selenites, venus), 'to satisfy', {
      users: { youCan: expect.it('to contain', 'post') },
    });
    expect(await getUserInfo(selenites, jupiter), 'to satisfy', {
      users: { youCan: expect.it('to contain', 'post') },
    });
  });

  it(`should allow 'post' for all users for protected group`, async () => {
    await updateGroupAsync(selenites.group, luna, { isProtected: '1' });
    expect(await getUserInfo(selenites, luna), 'to satisfy', {
      users: { youCan: expect.it('to contain', 'post') },
    });
    expect(await getUserInfo(selenites, mars), 'to satisfy', {
      users: { youCan: expect.it('to contain', 'post') },
    });
    expect(await getUserInfo(selenites, venus), 'to satisfy', {
      users: { youCan: expect.it('to contain', 'post') },
    });
    expect(await getUserInfo(selenites, jupiter), 'to satisfy', {
      users: { youCan: expect.it('to contain', 'post') },
    });
  });

  it(`should allow 'post' only for members of private group`, async () => {
    await updateGroupAsync(selenites.group, luna, { isPrivate: '1' });
    expect(await getUserInfo(selenites, luna), 'to satisfy', {
      users: { youCan: expect.it('to contain', 'post') },
    });
    expect(await getUserInfo(selenites, mars), 'to satisfy', {
      users: { youCan: expect.it('to contain', 'post') },
    });
    expect(await getUserInfo(selenites, venus), 'to satisfy', {
      users: { youCan: expect.it('to contain', 'post') },
    });
    expect(await getUserInfo(selenites, jupiter), 'to satisfy', {
      users: { youCan: expect.it('not to contain', 'post') },
    });
  });

  it(`should allow 'post' only for admins of restricted group`, async () => {
    await updateGroupAsync(selenites.group, luna, { isRestricted: '1' });
    expect(await getUserInfo(selenites, luna), 'to satisfy', {
      users: { youCan: expect.it('to contain', 'post') },
    });
    expect(await getUserInfo(selenites, mars), 'to satisfy', {
      users: { youCan: expect.it('not to contain', 'post') },
    });
    expect(await getUserInfo(selenites, venus), 'to satisfy', {
      users: { youCan: expect.it('to contain', 'post') },
    });
    expect(await getUserInfo(selenites, jupiter), 'to satisfy', {
      users: { youCan: expect.it('not to contain', 'post') },
    });
  });

  describe('Mars is blocked in group', () => {
    beforeEach(() => blockUserInGroup(mars, selenites, luna));

    it(`should allow 'post' for all users (except Mars) for public group`, async () => {
      expect(await getUserInfo(selenites, luna), 'to satisfy', {
        users: {
          youCan: expect.it('to contain', 'post'),
          theyDid: expect.it('not to contain', 'block'),
        },
      });
      expect(await getUserInfo(selenites, mars), 'to satisfy', {
        users: {
          youCan: expect.it('not to contain', 'post'),
          theyDid: expect.it('to contain', 'block'),
        },
      });
      expect(await getUserInfo(selenites, venus), 'to satisfy', {
        users: {
          youCan: expect.it('to contain', 'post'),
          theyDid: expect.it('not to contain', 'block'),
        },
      });
      expect(await getUserInfo(selenites, jupiter), 'to satisfy', {
        users: {
          youCan: expect.it('to contain', 'post'),
          theyDid: expect.it('not to contain', 'block'),
        },
      });
    });

    it(`should allow 'post' for all users (except Mars) for protected group`, async () => {
      await updateGroupAsync(selenites.group, luna, { isProtected: '1' });
      expect(await getUserInfo(selenites, luna), 'to satisfy', {
        users: { youCan: expect.it('to contain', 'post') },
      });
      expect(await getUserInfo(selenites, mars), 'to satisfy', {
        users: { youCan: expect.it('not to contain', 'post') },
      });
      expect(await getUserInfo(selenites, venus), 'to satisfy', {
        users: { youCan: expect.it('to contain', 'post') },
      });
      expect(await getUserInfo(selenites, jupiter), 'to satisfy', {
        users: { youCan: expect.it('to contain', 'post') },
      });
    });

    it(`should allow 'post' only for members (except Mars) of private group`, async () => {
      await updateGroupAsync(selenites.group, luna, { isPrivate: '1' });
      expect(await getUserInfo(selenites, luna), 'to satisfy', {
        users: { youCan: expect.it('to contain', 'post') },
      });
      expect(await getUserInfo(selenites, mars), 'to satisfy', {
        users: { youCan: expect.it('not to contain', 'post') },
      });
      expect(await getUserInfo(selenites, venus), 'to satisfy', {
        users: { youCan: expect.it('to contain', 'post') },
      });
      expect(await getUserInfo(selenites, jupiter), 'to satisfy', {
        users: { youCan: expect.it('not to contain', 'post') },
      });
    });

    it(`should allow 'post' only for admins of restricted group`, async () => {
      await updateGroupAsync(selenites.group, luna, { isRestricted: '1' });
      expect(await getUserInfo(selenites, luna), 'to satisfy', {
        users: { youCan: expect.it('to contain', 'post') },
      });
      expect(await getUserInfo(selenites, mars), 'to satisfy', {
        users: { youCan: expect.it('not to contain', 'post') },
      });
      expect(await getUserInfo(selenites, venus), 'to satisfy', {
        users: { youCan: expect.it('to contain', 'post') },
      });
      expect(await getUserInfo(selenites, jupiter), 'to satisfy', {
        users: { youCan: expect.it('not to contain', 'post') },
      });
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
