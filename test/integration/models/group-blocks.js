/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../../dbCleaner';
import { dbAdapter, User, Group } from '../../../app/models';
import { EVENT_TYPES } from '../../../app/support/EventTypes';

describe('Group blocks', () => {
  beforeEach(() => cleanDB($pg_database));

  let luna, mars, venus, selenites;

  beforeEach(async () => {
    luna = new User({ username: 'luna', password: 'pw' });
    mars = new User({ username: 'mars', password: 'pw' });
    venus = new User({ username: 'venus', password: 'pw' });
    await Promise.all([luna.create(), mars.create(), venus.create()]);

    selenites = new Group({ username: 'selenites' });
    await selenites.create(luna.id);
    await selenites.addAdministrator(venus.id);
  });

  it(`should block Mars in Selenites`, async () => {
    const ok = await selenites.blockUser(mars.id, luna.id);
    expect(ok, 'to be true');
    const blockedIds = await dbAdapter.userIdsBlockedInGroup(selenites.id);
    expect(blockedIds, 'to equal', [mars.id]);
  });

  it(`should create notifications for Mars and all Selenites admins on block`, async () => {
    await selenites.blockUser(mars.id, luna.id);

    for (const user of [luna, mars, venus]) {
      // eslint-disable-next-line no-await-in-loop
      const events = await dbAdapter.getUserEvents(user.intId, [EVENT_TYPES.BLOCKED_IN_GROUP]);
      expect(events, 'to satisfy', [
        {
          user_id: user.intId,
          event_type: EVENT_TYPES.BLOCKED_IN_GROUP,
          created_by_user_id: luna.intId,
          target_user_id: mars.intId,
          group_id: selenites.intId,
        },
      ]);
    }
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

    it(`should create notifications for Mars and all Selenites admins on unblock`, async () => {
      await selenites.unblockUser(mars.id, luna.id);

      for (const user of [luna, mars, venus]) {
        // eslint-disable-next-line no-await-in-loop
        const events = await dbAdapter.getUserEvents(user.intId, [
          EVENT_TYPES.BLOCKED_IN_GROUP,
          EVENT_TYPES.UNBLOCKED_IN_GROUP,
        ]);
        expect(events, 'to satisfy', [
          {
            user_id: user.intId,
            event_type: EVENT_TYPES.UNBLOCKED_IN_GROUP,
            created_by_user_id: luna.intId,
            target_user_id: mars.intId,
            group_id: selenites.intId,
          },
          {
            user_id: user.intId,
            event_type: EVENT_TYPES.BLOCKED_IN_GROUP,
            created_by_user_id: luna.intId,
            target_user_id: mars.intId,
            group_id: selenites.intId,
          },
        ]);
      }
    });
  });
});
