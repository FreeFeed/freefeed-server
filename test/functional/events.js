/* eslint-env node, mocha */
/* global $pg_database */
import knexCleaner from 'knex-cleaner'
import expect from 'unexpected'

import { DummyPublisher } from '../../app/pubsub'
import { PubSub, dbAdapter } from '../../app/models'
import {
  banUser,
  createUserAsync,
  mutualSubscriptions,
  subscribeToAsync,
  unbanUser
} from '../functional/functional_test_helper'

describe('EventService', () => {
  before(async () => {
    PubSub.setPublisher(new DummyPublisher());
  });

  beforeEach(async () => {
    await knexCleaner.clean($pg_database);
  });

  describe('bans', () => {
    let luna, mars, jupiter, pluto;
    let lunaUserModel, marsUserModel, jupiterUserModel, plutoUserModel;

    const expectUserEventsToBe = async (user, expectedEvents) => {
      const userEvents = await dbAdapter.getUserEvents(user.intId);
      expect(userEvents, 'to be an', 'array');
      expect(userEvents, 'to have length', expectedEvents.length);
      for (const i in userEvents) {
        expect(userEvents[i], 'to satisfy', expectedEvents[i]);
      }
    };

    beforeEach(async () => {
      [luna, mars, jupiter, pluto] = await Promise.all([
        createUserAsync('luna', 'pw'),
        createUserAsync('mars', 'pw'),
        createUserAsync('jupiter', 'pw'),
        createUserAsync('pluto', 'pw'),
      ]);

      [lunaUserModel, marsUserModel, jupiterUserModel, plutoUserModel] = await dbAdapter.getUsersByIds([
        luna.user.id,
        mars.user.id,
        jupiter.user.id,
        pluto.user.id
      ]);

      await mutualSubscriptions([luna, mars]);
      await subscribeToAsync(jupiter, luna);
    });

    it('should create banned_user event for banner', async () => {
      await banUser(luna, mars);
      await expectUserEventsToBe(lunaUserModel, [{
        user_id:            lunaUserModel.intId,
        event_type:         'banned_user',
        created_by_user_id: lunaUserModel.intId,
        target_user_id:     marsUserModel.intId,
      }]);
    });

    it('should create event for banned friend', async () => {
      await banUser(luna, mars);
      await expectUserEventsToBe(marsUserModel, [{
        user_id:            marsUserModel.intId,
        event_type:         'banned_by_user',
        created_by_user_id: lunaUserModel.intId,
        target_user_id:     marsUserModel.intId,
      }]);
    });

    it('should create event for banned subscriber', async () => {
      await banUser(luna, jupiter);
      await expectUserEventsToBe(jupiterUserModel, [{
        user_id:            jupiterUserModel.intId,
        event_type:         'banned_by_user',
        created_by_user_id: lunaUserModel.intId,
        target_user_id:     jupiterUserModel.intId,
      }]);
    });

    it('should create event for arbitrary banned user', async () => {
      await banUser(luna, pluto);
      await expectUserEventsToBe(plutoUserModel, [{
        user_id:            plutoUserModel.intId,
        event_type:         'banned_by_user',
        created_by_user_id: lunaUserModel.intId,
        target_user_id:     plutoUserModel.intId,
      }]);
    });

    describe('and unbans', () => {
      it('should create unbanned_user event for unbanner', async () => {
        await banUser(luna, mars);
        await unbanUser(luna, mars);
        await expectUserEventsToBe(lunaUserModel, [{
          user_id:            lunaUserModel.intId,
          event_type:         'unbanned_user',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
        }, { event_type: 'banned_user' }]);
      });

      it('should create event for unbanned friend', async () => {
        await banUser(luna, mars);
        await unbanUser(luna, mars);
        await expectUserEventsToBe(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'unbanned_by_user',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
        }, { event_type: 'banned_by_user' }]);
      });

      it('should create event for unbanned subscriber', async () => {
        await banUser(luna, jupiter);
        await unbanUser(luna, jupiter);
        await expectUserEventsToBe(jupiterUserModel, [{
          user_id:            jupiterUserModel.intId,
          event_type:         'unbanned_by_user',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     jupiterUserModel.intId,
        }, { event_type: 'banned_by_user' }]);
      });

      it('should create event for arbitrary unbanned user', async () => {
        await banUser(luna, pluto);
        await unbanUser(luna, pluto);
        await expectUserEventsToBe(plutoUserModel, [{
          user_id:            plutoUserModel.intId,
          event_type:         'unbanned_by_user',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     plutoUserModel.intId,
        }, { event_type: 'banned_by_user' }]);
      });
    });
  });
});
