/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../../dbCleaner';
import { dbAdapter, User, Group } from '../../../app/models';

describe('Group blocks', () => {
  beforeEach(() => cleanDB($pg_database));

  let luna, mars, selenites;

  beforeEach(async () => {
    luna = new User({ username: 'luna', password: 'pw' });
    mars = new User({ username: 'mars', password: 'pw' });
    await Promise.all([luna.create(), mars.create()]);

    selenites = new Group({ username: 'selenites' });
    await selenites.create(luna.id);
  });

  it(`should block Mars in Selenites`, async () => {
    const ok = await selenites.blockUser(mars.id, luna.id);
    expect(ok, 'to be true');
    const blockedIds = await dbAdapter.userIdsBlockedInGroup(selenites.id);
    expect(blockedIds, 'to equal', [mars.id]);
  });

  describe(`Mars is blocked in Selenites`, () => {
    beforeEach(() => selenites.blockUser(mars.id, luna.id));

    it(`should not block Mars in Selenites twice`, async () => {
      const ok = await selenites.blockUser(mars.id, luna.id);
      expect(ok, 'to be false');
      const blockedIds = await dbAdapter.userIdsBlockedInGroup(selenites.id);
      expect(blockedIds, 'to equal', [mars.id]);
    });

    it(`should unblock Mars in Selenites`, async () => {
      const ok = await selenites.unblockUser(mars.id, luna.id);
      expect(ok, 'to be true');
      const blockedIds = await dbAdapter.userIdsBlockedInGroup(selenites.id);
      expect(blockedIds, 'to equal', []);
    });

    it(`should not unblock Mars in Selenites twice`, async () => {
      let ok = await selenites.unblockUser(mars.id, luna.id);
      expect(ok, 'to be true');
      ok = await selenites.unblockUser(mars.id, luna.id);
      expect(ok, 'to be false');
      const blockedIds = await dbAdapter.userIdsBlockedInGroup(selenites.id);
      expect(blockedIds, 'to equal', []);
    });
  });
});
