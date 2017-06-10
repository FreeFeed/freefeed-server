/* eslint-env node, mocha */
/* global $pg_database */
import knexCleaner from 'knex-cleaner'
import expect from 'unexpected'

import { DummyPublisher } from '../../app/pubsub'
import { PubSub, dbAdapter } from '../../app/models'
import {
  acceptRequestAsync,
  acceptRequestToJoinGroup,
  banUser,
  createAndReturnPostToFeed,
  createCommentAsync,
  createUserAsync,
  createGroupAsync,
  deletePostAsync,
  demoteFromAdmin,
  getUserEvents,
  goPrivate,
  kickOutUserFromGroup,
  mutualSubscriptions,
  promoteToAdmin,
  rejectRequestAsync,
  rejectSubscriptionRequestToGroup,
  removeCommentAsync,
  revokeSubscriptionRequest,
  sendRequestToSubscribe,
  sendRequestToJoinGroup,
  subscribeToAsync,
  unsubscribeFromAsync,
  unsubscribeUserFromMeAsync,
  unbanUser
} from '../functional/functional_test_helper'
import * as schema from './schemaV2-helper'

describe('EventService', () => {
  before(async () => {
    PubSub.setPublisher(new DummyPublisher());
  });

  beforeEach(async () => {
    await knexCleaner.clean($pg_database);
  });

  const expectUserEventsToBe = async (user, expectedEvents, requestedEventTypes = null) => {
    const userEvents = await dbAdapter.getUserEvents(user.intId, requestedEventTypes);
    expect(userEvents, 'to be an', 'array');
    expect(userEvents, 'to have length', expectedEvents.length);
    for (const i in userEvents) {
      expect(userEvents[i], 'to satisfy', expectedEvents[i]);
    }
  };

  describe('bans', () => {
    let luna, mars, jupiter, pluto;
    let lunaUserModel, marsUserModel, jupiterUserModel, plutoUserModel;

    const expectBanEvents = (user, expectedEvents) => {
      return expectUserEventsToBe(user, expectedEvents, ['banned_user', 'unbanned_user', 'banned_by_user', 'unbanned_by_user']);
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
      await expectBanEvents(lunaUserModel, [{
        user_id:            lunaUserModel.intId,
        event_type:         'banned_user',
        created_by_user_id: lunaUserModel.intId,
        target_user_id:     marsUserModel.intId,
      }]);
    });

    it('should create event for banned friend', async () => {
      await banUser(luna, mars);
      await expectBanEvents(marsUserModel, [{
        user_id:            marsUserModel.intId,
        event_type:         'banned_by_user',
        created_by_user_id: lunaUserModel.intId,
        target_user_id:     marsUserModel.intId,
      }]);
    });

    it('should create event for banned subscriber', async () => {
      await banUser(luna, jupiter);
      await expectBanEvents(jupiterUserModel, [{
        user_id:            jupiterUserModel.intId,
        event_type:         'banned_by_user',
        created_by_user_id: lunaUserModel.intId,
        target_user_id:     jupiterUserModel.intId,
      }]);
    });

    it('should create event for arbitrary banned user', async () => {
      await banUser(luna, pluto);
      await expectBanEvents(plutoUserModel, [{
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
        await expectBanEvents(lunaUserModel, [{
          user_id:            lunaUserModel.intId,
          event_type:         'unbanned_user',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
        }, { event_type: 'banned_user' }]);
      });

      it('should create event for unbanned friend', async () => {
        await banUser(luna, mars);
        await unbanUser(luna, mars);
        await expectBanEvents(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'unbanned_by_user',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
        }, { event_type: 'banned_by_user' }]);
      });

      it('should create event for unbanned subscriber', async () => {
        await banUser(luna, jupiter);
        await unbanUser(luna, jupiter);
        await expectBanEvents(jupiterUserModel, [{
          user_id:            jupiterUserModel.intId,
          event_type:         'unbanned_by_user',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     jupiterUserModel.intId,
        }, { event_type: 'banned_by_user' }]);
      });

      it('should create event for arbitrary unbanned user', async () => {
        await banUser(luna, pluto);
        await unbanUser(luna, pluto);
        await expectBanEvents(plutoUserModel, [{
          user_id:            plutoUserModel.intId,
          event_type:         'unbanned_by_user',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     plutoUserModel.intId,
        }, { event_type: 'banned_by_user' }]);
      });
    });
  });

  describe('subscriptions', () => {
    let luna, mars;
    let lunaUserModel, marsUserModel;

    const expectSubscriptionEvents = (user, expectedEvents) => {
      return expectUserEventsToBe(user, expectedEvents, ['user_subscribed', 'user_unsubscribed']);
    };

    beforeEach(async () => {
      [luna, mars] = await Promise.all([
        createUserAsync('luna', 'pw'),
        createUserAsync('mars', 'pw'),
      ]);

      [lunaUserModel, marsUserModel] = await dbAdapter.getUsersByIds([
        luna.user.id,
        mars.user.id
      ]);
    });

    it('should create user_subscribed event when user subscribed', async () => {
      await subscribeToAsync(mars, luna);
      await expectUserEventsToBe(lunaUserModel, [{
        user_id:            lunaUserModel.intId,
        event_type:         'user_subscribed',
        created_by_user_id: marsUserModel.intId,
        target_user_id:     lunaUserModel.intId,
      }]);
    });

    it('should not create events for subscriber', async () => {
      await subscribeToAsync(mars, luna);
      await expectUserEventsToBe(marsUserModel, []);
    });

    it('should create user_unsubscribed event when user unsubscribed', async () => {
      await subscribeToAsync(mars, luna);
      await unsubscribeFromAsync(mars, luna);
      await expectUserEventsToBe(lunaUserModel, [{
        user_id:            lunaUserModel.intId,
        event_type:         'user_unsubscribed',
        created_by_user_id: marsUserModel.intId,
        target_user_id:     lunaUserModel.intId,
      }, {
        user_id:            lunaUserModel.intId,
        event_type:         'user_subscribed',
        created_by_user_id: marsUserModel.intId,
        target_user_id:     lunaUserModel.intId,
      }]);
    });

    it('should create user_unsubscribed event when user unsubscription is forced', async () => {
      await subscribeToAsync(mars, luna);
      await unsubscribeUserFromMeAsync(luna, mars);
      await expectUserEventsToBe(lunaUserModel, [{
        user_id:            lunaUserModel.intId,
        event_type:         'user_unsubscribed',
        created_by_user_id: marsUserModel.intId,
        target_user_id:     lunaUserModel.intId,
      }, {
        user_id:            lunaUserModel.intId,
        event_type:         'user_subscribed',
        created_by_user_id: marsUserModel.intId,
        target_user_id:     lunaUserModel.intId,
      }]);
    });

    it('should not create events for unsubscriber', async () => {
      await subscribeToAsync(mars, luna);
      await unsubscribeFromAsync(mars, luna);
      await expectUserEventsToBe(marsUserModel, []);
    });

    it('should create user_unsubscribed event for banner when friend is banned', async () => {
      await mutualSubscriptions([mars, luna]);
      await banUser(luna, mars);
      await expectUserEventsToBe(lunaUserModel, [
        {
          user_id:            lunaUserModel.intId,
          event_type:         'user_unsubscribed',
          created_by_user_id: marsUserModel.intId,
          target_user_id:     lunaUserModel.intId,
        },
        { event_type: 'banned_user' },
        {
          user_id:            lunaUserModel.intId,
          event_type:         'user_subscribed',
          created_by_user_id: marsUserModel.intId,
          target_user_id:     lunaUserModel.intId,
        }
      ]);
    });

    it('should not create unsubscription events for banned friend', async () => {
      await mutualSubscriptions([mars, luna]);
      await banUser(luna, mars);
      await expectSubscriptionEvents(marsUserModel, [{ event_type: 'user_subscribed' }]);
    });

    it('should create user_unsubscribed event for banner when subscriber is banned', async () => {
      await subscribeToAsync(mars, luna);
      await banUser(luna, mars);
      await expectUserEventsToBe(lunaUserModel, [
        {
          user_id:            lunaUserModel.intId,
          event_type:         'user_unsubscribed',
          created_by_user_id: marsUserModel.intId,
          target_user_id:     lunaUserModel.intId,
        },
        { event_type: 'banned_user' },
        {
          user_id:            lunaUserModel.intId,
          event_type:         'user_subscribed',
          created_by_user_id: marsUserModel.intId,
          target_user_id:     lunaUserModel.intId,
        }
      ]);
    });

    it('should not create unsubscription events for banned subscriber', async () => {
      await subscribeToAsync(mars, luna);
      await banUser(luna, mars);
      await expectSubscriptionEvents(marsUserModel, []);
    });

    it('should not create user_unsubscribed event for banner when arbitrary user is banned', async () => {
      await banUser(luna, mars);
      await expectUserEventsToBe(lunaUserModel, [{ event_type: 'banned_user' }]);
    });

    it('should not create unsubscription events for banned arbitrary user', async () => {
      await banUser(luna, mars);
      await expectSubscriptionEvents(marsUserModel, []);
    });

    it('should not create user subscription events for groups', async () => {
      const dubhe = await createGroupAsync(luna, 'dubhe');
      await subscribeToAsync(mars, dubhe);
      await expectSubscriptionEvents(lunaUserModel, []);
      await expectSubscriptionEvents(marsUserModel, []);
    });

    it('should not create user unsubscription events for groups', async () => {
      const dubhe = await createGroupAsync(luna, 'dubhe');
      await subscribeToAsync(mars, dubhe);
      await unsubscribeFromAsync(mars, dubhe);
      await expectSubscriptionEvents(lunaUserModel, []);
      await expectSubscriptionEvents(marsUserModel, []);
    });
  });

  describe('subscription requests', () => {
    let luna, mars;
    let lunaUserModel, marsUserModel;

    const expectSubsRequestEvents = (user, expectedEvents) => {
      return expectUserEventsToBe(user, expectedEvents, ['subscription_requested', 'subscription_request_approved', 'subscription_request_rejected']);
    };

    beforeEach(async () => {
      [luna, mars] = await Promise.all([
        createUserAsync('luna', 'pw'),
        createUserAsync('mars', 'pw'),
      ]);

      [lunaUserModel, marsUserModel] = await dbAdapter.getUsersByIds([
        luna.user.id,
        mars.user.id
      ]);
      await goPrivate(luna);
    });

    it('should create subscription_requested event when subscription request is sent', async () => {
      await sendRequestToSubscribe(mars, luna);
      await expectUserEventsToBe(lunaUserModel, [{
        user_id:            lunaUserModel.intId,
        event_type:         'subscription_requested',
        created_by_user_id: marsUserModel.intId,
        target_user_id:     lunaUserModel.intId,
      }]);
    });

    it('should create subscription_request_revoked event when subscription request is revoked', async () => {
      await sendRequestToSubscribe(mars, luna);
      await revokeSubscriptionRequest(mars, luna);
      await expectUserEventsToBe(lunaUserModel, [
        {
          user_id:            lunaUserModel.intId,
          event_type:         'subscription_request_revoked',
          created_by_user_id: marsUserModel.intId,
          target_user_id:     lunaUserModel.intId,
        }, {
          user_id:            lunaUserModel.intId,
          event_type:         'subscription_requested',
          created_by_user_id: marsUserModel.intId,
          target_user_id:     lunaUserModel.intId,
        }
      ]);
    });

    it('should create subscription_request_approved event when subscription request is approved', async () => {
      await sendRequestToSubscribe(mars, luna);
      await acceptRequestAsync(luna, mars);
      await expectSubsRequestEvents(marsUserModel, [{
        user_id:            marsUserModel.intId,
        event_type:         'subscription_request_approved',
        created_by_user_id: lunaUserModel.intId,
        target_user_id:     marsUserModel.intId,
      }]);
    });

    it('should create user_subscribed event when subscription request is approved', async () => {
      await sendRequestToSubscribe(mars, luna);
      await acceptRequestAsync(luna, mars);
      await expectUserEventsToBe(lunaUserModel, [
        {
          user_id:            lunaUserModel.intId,
          event_type:         'user_subscribed',
          created_by_user_id: marsUserModel.intId,
          target_user_id:     lunaUserModel.intId,
        },
        {
          user_id:            lunaUserModel.intId,
          event_type:         'subscription_requested',
          created_by_user_id: marsUserModel.intId,
          target_user_id:     lunaUserModel.intId,
        }
      ]);
    });

    it('should create subscription_request_rejected event when subscription request is rejected', async () => {
      await sendRequestToSubscribe(mars, luna);
      await rejectRequestAsync(luna, mars);
      await expectSubsRequestEvents(marsUserModel, [{
        user_id:            marsUserModel.intId,
        event_type:         'subscription_request_rejected',
        created_by_user_id: lunaUserModel.intId,
        target_user_id:     marsUserModel.intId,
      }]);
    });

    it('should create subscription_request_rejected event for banned requester', async () => {
      await sendRequestToSubscribe(mars, luna);
      await banUser(luna, mars);
      await expectSubsRequestEvents(marsUserModel, [{
        user_id:            marsUserModel.intId,
        event_type:         'subscription_request_rejected',
        created_by_user_id: lunaUserModel.intId,
        target_user_id:     marsUserModel.intId,
      }]);
    });

    it('should not create subscription request events for banned arbitrary user', async () => {
      await banUser(luna, mars);
      await expectSubsRequestEvents(marsUserModel, []);
    });
  });

  describe('groups', () => {
    let luna, mars, jupiter, pluto;
    let lunaUserModel, marsUserModel, jupiterUserModel, plutoUserModel;

    const expectGroupCreationAndSubscriptionEvents = (user, expectedEvents) => {
      return expectUserEventsToBe(user, expectedEvents, ['group_created', 'group_subscribed', 'group_unsubscribed']);
    };

    const expectGroupAdminEvents = (user, expectedEvents) => {
      return expectUserEventsToBe(user, expectedEvents, ['group_admin_promoted', 'group_admin_demoted']);
    };

    const expectGroupRequestEvents = (user, expectedEvents) => {
      return expectUserEventsToBe(user, expectedEvents, ['group_subscription_requested', 'group_subscription_request_revoked', 'group_subscription_approved', 'group_subscription_rejected']);
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
        pluto.user.id,
      ]);
    });

    describe('creation', () => {
      it('should create group_created event for group owner', async () => {
        const dubhe = await createGroupAsync(luna, 'dubhe');
        const dubheGroupModel = await dbAdapter.getGroupById(dubhe.group.id);
        await expectGroupCreationAndSubscriptionEvents(lunaUserModel, [{
          user_id:            lunaUserModel.intId,
          event_type:         'group_created',
          created_by_user_id: lunaUserModel.intId,
          group_id:           dubheGroupModel.intId,
        }]);
      });
    });

    describe('subscription/unsubscription', () => {
      let dubhe, dubheGroupModel;

      beforeEach(async () => {
        dubhe = await createGroupAsync(luna, 'dubhe');
        dubheGroupModel = await dbAdapter.getGroupById(dubhe.group.id);
      });

      it('should create group_subscribed event on group subscription', async () => {
        await subscribeToAsync(jupiter, dubhe);
        await expectGroupCreationAndSubscriptionEvents(lunaUserModel, [
          {
            user_id:            lunaUserModel.intId,
            event_type:         'group_subscribed',
            created_by_user_id: jupiterUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }, { event_type: 'group_created' }
        ]);
      });

      it('should create group_subscribed event on group subscription for each group admin', async () => {
        await promoteToAdmin(dubhe, luna, mars);
        await subscribeToAsync(jupiter, dubhe);
        await expectGroupCreationAndSubscriptionEvents(lunaUserModel, [
          {
            user_id:            lunaUserModel.intId,
            event_type:         'group_subscribed',
            created_by_user_id: jupiterUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }, { event_type: 'group_created' }
        ]);
        await expectGroupCreationAndSubscriptionEvents(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'group_subscribed',
          created_by_user_id: jupiterUserModel.intId,
          group_id:           dubheGroupModel.intId,
        }]);
      });

      it('should not create group_subscribed event for newly added group admin', async () => {
        await promoteToAdmin(dubhe, luna, mars);
        await subscribeToAsync(jupiter, dubhe);
        await promoteToAdmin(dubhe, luna, pluto);
        await expectGroupCreationAndSubscriptionEvents(plutoUserModel, []);
      });

      it('should create group_unsubscribed event on group unsubscription', async () => {
        await subscribeToAsync(jupiter, dubhe);
        await unsubscribeFromAsync(jupiter, dubhe);
        await expectGroupCreationAndSubscriptionEvents(lunaUserModel, [
          {
            user_id:            lunaUserModel.intId,
            event_type:         'group_unsubscribed',
            created_by_user_id: jupiterUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }, { event_type: 'group_subscribed' }, { event_type: 'group_created' }
        ]);
      });

      it('should create group_unsubscribed event on group unsubscription for each group admin', async () => {
        await promoteToAdmin(dubhe, luna, mars);
        await subscribeToAsync(jupiter, dubhe);
        await unsubscribeFromAsync(jupiter, dubhe);
        await expectGroupCreationAndSubscriptionEvents(lunaUserModel, [
          {
            user_id:            lunaUserModel.intId,
            event_type:         'group_unsubscribed',
            created_by_user_id: jupiterUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }, { event_type: 'group_subscribed' }, { event_type: 'group_created' }
        ]);
        await expectGroupCreationAndSubscriptionEvents(marsUserModel, [
          {
            user_id:            marsUserModel.intId,
            event_type:         'group_unsubscribed',
            created_by_user_id: jupiterUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }, { event_type: 'group_subscribed' }
        ]);
      });

      it('should not create group_subscribed event for newly added group admin', async () => {
        await promoteToAdmin(dubhe, luna, mars);
        await subscribeToAsync(jupiter, dubhe);
        await unsubscribeFromAsync(jupiter, dubhe);
        await promoteToAdmin(dubhe, luna, pluto);
        await expectGroupCreationAndSubscriptionEvents(plutoUserModel, []);
      });

      it('should create group_unsubscribed event on kicking out user from group', async () => {
        await subscribeToAsync(jupiter, dubhe);
        await kickOutUserFromGroup(dubhe, luna, jupiter);
        await expectGroupCreationAndSubscriptionEvents(lunaUserModel, [
          {
            user_id:            lunaUserModel.intId,
            event_type:         'group_unsubscribed',
            created_by_user_id: jupiterUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }, { event_type: 'group_subscribed' }, { event_type: 'group_created' }
        ]);
      });

      it('should create group_unsubscribed event on kicking out user from group for each group admin', async () => {
        await promoteToAdmin(dubhe, luna, mars);
        await subscribeToAsync(jupiter, dubhe);
        await kickOutUserFromGroup(dubhe, luna, jupiter);
        await expectGroupCreationAndSubscriptionEvents(lunaUserModel, [
          {
            user_id:            lunaUserModel.intId,
            event_type:         'group_unsubscribed',
            created_by_user_id: jupiterUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }, { event_type: 'group_subscribed' }, { event_type: 'group_created' }
        ]);
        await expectGroupCreationAndSubscriptionEvents(marsUserModel, [
          {
            user_id:            marsUserModel.intId,
            event_type:         'group_unsubscribed',
            created_by_user_id: jupiterUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }, { event_type: 'group_subscribed' }
        ]);
      });
    });

    describe('admins promoting/demoting', () => {
      let dubhe, dubheGroupModel;

      beforeEach(async () => {
        dubhe           = await createGroupAsync(luna, 'dubhe');
        dubheGroupModel = await dbAdapter.getGroupById(dubhe.group.id);
      });

      it('should create group_admin_promoted event when user becomes group admin', async () => {
        await promoteToAdmin(dubhe, luna, mars);
        await expectGroupAdminEvents(lunaUserModel, [
          {
            user_id:            lunaUserModel.intId,
            event_type:         'group_admin_promoted',
            created_by_user_id: lunaUserModel.intId,
            target_user_id:     marsUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }
        ]);
      });

      it('should create group_admin_promoted event when user becomes group admin for each group admin except new one', async () => {
        await promoteToAdmin(dubhe, luna, mars);
        await promoteToAdmin(dubhe, mars, jupiter);
        await expectGroupAdminEvents(lunaUserModel, [
          {
            user_id:            lunaUserModel.intId,
            event_type:         'group_admin_promoted',
            created_by_user_id: marsUserModel.intId,
            target_user_id:     jupiterUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }, {
            user_id:            lunaUserModel.intId,
            event_type:         'group_admin_promoted',
            created_by_user_id: lunaUserModel.intId,
            target_user_id:     marsUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }
        ]);

        await expectGroupAdminEvents(marsUserModel, [
          {
            user_id:            marsUserModel.intId,
            event_type:         'group_admin_promoted',
            created_by_user_id: marsUserModel.intId,
            target_user_id:     jupiterUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }
        ]);

        await expectGroupAdminEvents(jupiterUserModel, []);
      });

      it('should create group_admin_demoted event when group admin demoted', async () => {
        await promoteToAdmin(dubhe, luna, mars);
        await demoteFromAdmin(dubhe, luna, mars);
        await expectGroupAdminEvents(lunaUserModel, [
          {
            user_id:            lunaUserModel.intId,
            event_type:         'group_admin_demoted',
            created_by_user_id: lunaUserModel.intId,
            target_user_id:     marsUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }, {
            user_id:            lunaUserModel.intId,
            event_type:         'group_admin_promoted',
            created_by_user_id: lunaUserModel.intId,
            target_user_id:     marsUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }
        ]);
      });

      it('should create group_admin_demoted event when group admin demoted for each group admin except demoted one', async () => {
        await promoteToAdmin(dubhe, luna, mars);
        await promoteToAdmin(dubhe, mars, jupiter);
        await demoteFromAdmin(dubhe, luna, jupiter);
        await expectGroupAdminEvents(lunaUserModel, [
          {
            user_id:            lunaUserModel.intId,
            event_type:         'group_admin_demoted',
            created_by_user_id: lunaUserModel.intId,
            target_user_id:     jupiterUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }, {
            user_id:            lunaUserModel.intId,
            event_type:         'group_admin_promoted',
            created_by_user_id: marsUserModel.intId,
            target_user_id:     jupiterUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }, {
            user_id:            lunaUserModel.intId,
            event_type:         'group_admin_promoted',
            created_by_user_id: lunaUserModel.intId,
            target_user_id:     marsUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }
        ]);

        await expectGroupAdminEvents(marsUserModel, [
          {
            user_id:            marsUserModel.intId,
            event_type:         'group_admin_demoted',
            created_by_user_id: lunaUserModel.intId,
            target_user_id:     jupiterUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }, {
            user_id:            marsUserModel.intId,
            event_type:         'group_admin_promoted',
            created_by_user_id: marsUserModel.intId,
            target_user_id:     jupiterUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }
        ]);

        await expectGroupAdminEvents(jupiterUserModel, []);
      });
    });

    describe('subscription requests', () => {
      let dubhe, dubheGroupModel;

      beforeEach(async () => {
        dubhe           = await createGroupAsync(luna, 'dubhe', 'Dubhe', true);
        dubheGroupModel = await dbAdapter.getGroupById(dubhe.group.id);
      });

      it('should create group_subscription_requested event when user sends join request to group', async () => {
        await sendRequestToJoinGroup(mars, dubhe);
        await expectGroupRequestEvents(lunaUserModel, [
          {
            user_id:            lunaUserModel.intId,
            event_type:         'group_subscription_requested',
            created_by_user_id: marsUserModel.intId,
            target_user_id:     marsUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }
        ]);
      });

      it('should create group_subscription_request_revoked event when user revokes join request to group', async () => {
        await sendRequestToJoinGroup(mars, dubhe);
        await revokeSubscriptionRequest(mars, dubhe);
        await expectGroupRequestEvents(lunaUserModel, [
          {
            user_id:            lunaUserModel.intId,
            event_type:         'group_subscription_request_revoked',
            created_by_user_id: marsUserModel.intId,
            target_user_id:     marsUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }, {
            user_id:            lunaUserModel.intId,
            event_type:         'group_subscription_requested',
            created_by_user_id: marsUserModel.intId,
            target_user_id:     marsUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }
        ]);
      });

      it('should create group_subscription_requested event when user sends join request to group for each group admin', async () => {
        await promoteToAdmin(dubhe, luna, jupiter);
        await sendRequestToJoinGroup(mars, dubhe);
        await expectGroupRequestEvents(lunaUserModel, [
          {
            user_id:            lunaUserModel.intId,
            event_type:         'group_subscription_requested',
            created_by_user_id: marsUserModel.intId,
            target_user_id:     marsUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }
        ]);
        await expectGroupRequestEvents(jupiterUserModel, [
          {
            user_id:            jupiterUserModel.intId,
            event_type:         'group_subscription_requested',
            created_by_user_id: marsUserModel.intId,
            target_user_id:     marsUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }
        ]);
      });

      it('should create group_subscription_approved event when user subscription request is accepted', async () => {
        await sendRequestToJoinGroup(mars, dubhe);
        await acceptRequestToJoinGroup(luna, mars, dubhe);
        await expectGroupRequestEvents(lunaUserModel, [
          {
            user_id:            lunaUserModel.intId,
            event_type:         'group_subscription_approved',
            created_by_user_id: lunaUserModel.intId,
            target_user_id:     marsUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }, { event_type: 'group_subscription_requested' }
        ]);
      });

      it('should create group_subscription_approved event when user subscription request is accepted for each group admin', async () => {
        await promoteToAdmin(dubhe, luna, jupiter);
        await sendRequestToJoinGroup(mars, dubhe);
        await acceptRequestToJoinGroup(luna, mars, dubhe);
        await expectGroupRequestEvents(lunaUserModel, [
          {
            user_id:            lunaUserModel.intId,
            event_type:         'group_subscription_approved',
            created_by_user_id: lunaUserModel.intId,
            target_user_id:     marsUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }, { event_type: 'group_subscription_requested' }
        ]);
        await expectGroupRequestEvents(jupiterUserModel, [
          {
            user_id:            jupiterUserModel.intId,
            event_type:         'group_subscription_approved',
            created_by_user_id: lunaUserModel.intId,
            target_user_id:     marsUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }, { event_type: 'group_subscription_requested' }
        ]);
      });

      it('should create group_subscription_approved event for requester when subscription request is accepted', async () => {
        await sendRequestToJoinGroup(mars, dubhe);
        await acceptRequestToJoinGroup(luna, mars, dubhe);
        await expectGroupRequestEvents(marsUserModel, [
          {
            user_id:            marsUserModel.intId,
            event_type:         'group_subscription_approved',
            created_by_user_id: lunaUserModel.intId,
            target_user_id:     marsUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }
        ]);
      });

      it('should create group_subscription_rejected event when user subscription request is rejected', async () => {
        await sendRequestToJoinGroup(mars, dubhe);
        await rejectSubscriptionRequestToGroup(luna, mars, dubhe);
        await expectGroupRequestEvents(lunaUserModel, [
          {
            user_id:            lunaUserModel.intId,
            event_type:         'group_subscription_rejected',
            created_by_user_id: lunaUserModel.intId,
            target_user_id:     marsUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }, { event_type: 'group_subscription_requested' }
        ]);
      });

      it('should create group_subscription_rejected event when user subscription request is rejected for each group admin', async () => {
        await promoteToAdmin(dubhe, luna, jupiter);
        await sendRequestToJoinGroup(mars, dubhe);
        await rejectSubscriptionRequestToGroup(luna, mars, dubhe);
        await expectGroupRequestEvents(lunaUserModel, [
          {
            user_id:            lunaUserModel.intId,
            event_type:         'group_subscription_rejected',
            created_by_user_id: lunaUserModel.intId,
            target_user_id:     marsUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }, { event_type: 'group_subscription_requested' }
        ]);
        await expectGroupRequestEvents(jupiterUserModel, [
          {
            user_id:            jupiterUserModel.intId,
            event_type:         'group_subscription_rejected',
            created_by_user_id: lunaUserModel.intId,
            target_user_id:     marsUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }, { event_type: 'group_subscription_requested' }
        ]);
      });

      it('should create group_subscription_rejected event for requester when subscription request is rejected', async () => {
        await sendRequestToJoinGroup(mars, dubhe);
        await rejectSubscriptionRequestToGroup(luna, mars, dubhe);
        await expectGroupRequestEvents(marsUserModel, [
          {
            user_id:            marsUserModel.intId,
            event_type:         'group_subscription_rejected',
            created_by_user_id: null,
            target_user_id:     marsUserModel.intId,
            group_id:           dubheGroupModel.intId,
          }
        ]);
      });
    });
  });

  describe('direct', () => {
    let luna, mars, jupiter, pluto;
    let lunaUserModel, marsUserModel, jupiterUserModel, plutoUserModel;

    const expectPostEvents = (user, expectedEvents) => {
      return expectUserEventsToBe(user, expectedEvents, ['direct', 'direct_comment']);
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
        pluto.user.id,
      ]);

      await mutualSubscriptions([luna, mars, jupiter, pluto]);
    });

    describe('posts', () => {
      it('should create direct event on direct post creation for direct receiver', async () => {
        await createAndReturnPostToFeed(mars, luna, 'Direct');
        await expectPostEvents(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'direct',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }]);
      });

      it('should not create direct event on direct post creation for direct sender', async () => {
        await createAndReturnPostToFeed(mars, luna, 'Direct');
        await expectPostEvents(lunaUserModel, []);
      });

      it('should create direct event on direct post creation for all direct receivers', async () => {
        await createAndReturnPostToFeed({ username: [mars.username, jupiter.username, pluto.username] }, luna, 'Direct');
        await expectPostEvents(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'direct',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }]);
        await expectPostEvents(jupiterUserModel, [{
          user_id:            jupiterUserModel.intId,
          event_type:         'direct',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     jupiterUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }]);
        await expectPostEvents(plutoUserModel, [{
          user_id:            plutoUserModel.intId,
          event_type:         'direct',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     plutoUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }]);
      });

      it('should not create direct event on semi-direct post (copy to own post feed) creation for direct sender', async () => {
        await createAndReturnPostToFeed({ username: [luna.username, mars.username] }, luna, 'Direct');
        await expectPostEvents(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'direct',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }]);
        await expectPostEvents(lunaUserModel, []);
      });
    });

    describe('comments', () => {
      it("should create direct_comment event on sender's comment creation for direct receiver", async () => {
        const post = await createAndReturnPostToFeed(mars, luna, 'Direct');
        await createCommentAsync(luna, post.id, 'Comment');
        await expectPostEvents(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'direct_comment',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }, { event_type: 'direct' }]);
      });

      it("should create direct_comment event on receiver's comment creation for direct sender", async () => {
        const post = await createAndReturnPostToFeed(mars, luna, 'Direct');
        await createCommentAsync(mars, post.id, 'Comment');
        await expectPostEvents(lunaUserModel, [{
          user_id:            lunaUserModel.intId,
          event_type:         'direct_comment',
          created_by_user_id: marsUserModel.intId,
          target_user_id:     lunaUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }]);
      });

      it('should not create direct_comment event on comment creation for comment author', async () => {
        const post = await createAndReturnPostToFeed(mars, luna, 'Direct');
        await createCommentAsync(luna, post.id, 'Comment');
        await expectPostEvents(lunaUserModel, []);
      });

      it('should not create direct_comment event on comment creation for comment author', async () => {
        const post = await createAndReturnPostToFeed(mars, luna, 'Direct');
        await createCommentAsync(mars, post.id, 'Comment');
        await expectPostEvents(marsUserModel, [{ event_type: 'direct' }]);
      });

      it('should create direct_comment event on comment creation for all direct receivers except comment author', async () => {
        const post = await createAndReturnPostToFeed({ username: [mars.username, jupiter.username, pluto.username] }, luna, 'Direct');
        await createCommentAsync(luna, post.id, 'Comment');
        await expectPostEvents(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'direct_comment',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }, { event_type: 'direct' }]);
        await expectPostEvents(jupiterUserModel, [{
          user_id:            jupiterUserModel.intId,
          event_type:         'direct_comment',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     jupiterUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }, { event_type: 'direct' }]);
        await expectPostEvents(plutoUserModel, [{
          user_id:            plutoUserModel.intId,
          event_type:         'direct_comment',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     plutoUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }, { event_type: 'direct' }]);
      });

      it('should not create direct_comment event on comment to semi-direct post (copy to own post feed) creation for comment author', async () => {
        const post = await createAndReturnPostToFeed({ username: [luna.username, mars.username] }, luna, 'Direct');
        await createCommentAsync(luna, post.id, 'Comment');
        await expectPostEvents(lunaUserModel, []);
      });

      it('should create direct_comment event on comment to semi-direct post (copy to own post feed) creation', async () => {
        const post = await createAndReturnPostToFeed({ username: [luna.username, mars.username] }, luna, 'Direct');
        await createCommentAsync(luna, post.id, 'Comment');
        await expectPostEvents(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'direct_comment',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }, { event_type: 'direct' }]);
      });

      it('should create direct_comment event on comment to semi-direct post (copy to own post feed) creation', async () => {
        const post = await createAndReturnPostToFeed({ username: [luna.username, mars.username] }, luna, 'Direct');
        await createCommentAsync(mars, post.id, 'Comment');
        await expectPostEvents(lunaUserModel, [{
          user_id:            lunaUserModel.intId,
          event_type:         'direct_comment',
          created_by_user_id: marsUserModel.intId,
          target_user_id:     lunaUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }]);
        await expectPostEvents(marsUserModel, [{ event_type: 'direct' }]);
      });

      it('should create direct_comment event on comment to semi-direct post (copy to own post feed) creation by arbitrary user', async () => {
        const post = await createAndReturnPostToFeed({ username: [luna.username, mars.username] }, luna, 'Direct');
        await createCommentAsync(jupiter, post.id, 'Comment');
        await expectPostEvents(lunaUserModel, [{
          user_id:            lunaUserModel.intId,
          event_type:         'direct_comment',
          created_by_user_id: jupiterUserModel.intId,
          target_user_id:     lunaUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }]);
        await expectPostEvents(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'direct_comment',
          created_by_user_id: jupiterUserModel.intId,
          target_user_id:     marsUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }, { event_type: 'direct' }]);
      });

      it("should not create direct_comment event on sender's comment creation for direct receiver when receiver banned sender", async () => {
        const post = await createAndReturnPostToFeed(mars, luna, 'Direct');
        await banUser(mars, luna);
        await createCommentAsync(luna, post.id, 'Comment');
        await expectPostEvents(marsUserModel, [{ event_type: 'direct' }]);
      });

      it("should not create direct_comment event on sender's comment creation for direct receiver when receiver banned sender", async () => {
        const post = await createAndReturnPostToFeed(mars, luna, 'Direct');
        await banUser(luna, mars);
        await createCommentAsync(luna, post.id, 'Comment');
        await expectPostEvents(marsUserModel, [{ event_type: 'direct' }]);
      });
    });
  });

  describe('mentions', () => {
    let luna, mars, jupiter, pluto;
    let lunaUserModel, marsUserModel, jupiterUserModel, plutoUserModel;

    const expectMentionEvents = (user, expectedEvents) => {
      return expectUserEventsToBe(user, expectedEvents, ['mention_in_post', 'mention_in_comment', 'mention_comment_to']);
    };

    const expectNoEventsOfTypes = async (eventTypes) => {
      const [{ count }] = await dbAdapter.database('events').whereIn('event_type', eventTypes).count();
      expect(parseInt(count), 'to be', 0);
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
        pluto.user.id,
      ]);
      await mutualSubscriptions([luna, jupiter]);
      await goPrivate(jupiter);
    });

    describe('in posts', () => {
      it('should create mention_in_post event for mentioned user', async () => {
        await createAndReturnPostToFeed(luna, luna, 'Mentioning @mars');
        await expectMentionEvents(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'mention_in_post',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }]);
        await expectMentionEvents(lunaUserModel, []);
      });

      it('should not create mention_in_post event for mentioned post author', async () => {
        await createAndReturnPostToFeed(luna, luna, 'Mentioning @luna');
        await expectMentionEvents(lunaUserModel, []);
      });

      it('should create mention_in_post event for each mentioned user', async () => {
        await createAndReturnPostToFeed(luna, luna, 'Mentioning @mars, @jupiter, @pluto');
        await expectMentionEvents(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'mention_in_post',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }]);
        await expectMentionEvents(jupiterUserModel, [{
          user_id:            jupiterUserModel.intId,
          event_type:         'mention_in_post',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     jupiterUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }]);
        await expectMentionEvents(plutoUserModel, [{
          user_id:            plutoUserModel.intId,
          event_type:         'mention_in_post',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     plutoUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }]);
      });

      it('should not create mention_in_post event for group', async () => {
        await createGroupAsync(luna, 'dubhe');
        await createAndReturnPostToFeed(luna, luna, 'Mentioning @dubhe');
        await expectNoEventsOfTypes(['mention_in_post']);
      });

      it('should create mention_in_post event with proper group_id for post in group', async () => {
        const dubhe = await createGroupAsync(luna, 'dubhe');
        const dubheGroupModel = await dbAdapter.getGroupById(dubhe.group.id);
        await createAndReturnPostToFeed(dubhe, luna, 'Mentioning @mars');
        await expectMentionEvents(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'mention_in_post',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
          group_id:           dubheGroupModel.intId,
          post_author_id:     lunaUserModel.intId,
        }]);
      });

      it('should not create mention_in_post event for not-existent user', async () => {
        await createAndReturnPostToFeed(luna, luna, 'Mentioning @notexistent');
        await expectNoEventsOfTypes(['mention_in_post']);
      });

      it('should not create mention_in_post event for mentioned user who banned post author', async () => {
        await banUser(mars, luna);
        await createAndReturnPostToFeed(luna, luna, 'Mentioning @mars');
        await expectMentionEvents(marsUserModel, []);
        await expectMentionEvents(lunaUserModel, []);
      });

      it('should not create mention_in_post event for banned mentioned user', async () => {
        await banUser(luna, mars);
        await createAndReturnPostToFeed(luna, luna, 'Mentioning @mars');
        await expectMentionEvents(marsUserModel, []);
        await expectMentionEvents(lunaUserModel, []);
      });

      it('should not create mention_in_post event for user who was mentioned in private post of non-friend', async () => {
        await createAndReturnPostToFeed(jupiter, jupiter, 'Mentioning @mars, @luna');
        await expectMentionEvents(lunaUserModel, [{
          user_id:            lunaUserModel.intId,
          event_type:         'mention_in_post',
          created_by_user_id: jupiterUserModel.intId,
          target_user_id:     lunaUserModel.intId,
          post_author_id:     jupiterUserModel.intId,
        }]);
        await expectMentionEvents(marsUserModel, []);
      });

      it('should create only one mention_in_post event for mentioned user for one post', async () => {
        await createAndReturnPostToFeed(luna, luna, 'Mentioning @mars, @mars, @mars @mars @mars @mars @mars @mars @mars!11');
        await expectMentionEvents(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'mention_in_post',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }]);
      });
    });

    describe('in comments', () => {
      let post;

      beforeEach(async () => {
        post = await createAndReturnPostToFeed(luna, luna, 'Test post');
      });

      it('should create mention_in_comment event for mentioned user', async () => {
        await createCommentAsync(luna, post.id, 'Mentioning @mars');
        await expectMentionEvents(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'mention_in_comment',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }]);
        await expectMentionEvents(lunaUserModel, []);
      });

      it('should create mention_comment_to event for reply to user', async () => {
        await createCommentAsync(luna, post.id, '@mars comment for you');
        await expectMentionEvents(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'mention_comment_to',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }]);
        await expectMentionEvents(lunaUserModel, []);
      });

      it('should create mention_in_comment event for mentioned post author', async () => {
        await createCommentAsync(mars, post.id, 'Mentioning @luna');
        await expectMentionEvents(lunaUserModel, [{
          user_id:            lunaUserModel.intId,
          event_type:         'mention_in_comment',
          created_by_user_id: marsUserModel.intId,
          target_user_id:     lunaUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }]);
      });

      it('should not create mention_in_comment event for mentioned comment author', async () => {
        await createCommentAsync(luna, post.id, '@luna @luna');
        await expectMentionEvents(lunaUserModel, []);
      });

      it('should create mention_in_comment event for each mentioned user', async () => {
        await createCommentAsync(luna, post.id, 'Mentioning @mars, @jupiter, @pluto');
        await expectMentionEvents(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'mention_in_comment',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }]);
        await expectMentionEvents(jupiterUserModel, [{
          user_id:            jupiterUserModel.intId,
          event_type:         'mention_in_comment',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     jupiterUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }]);
        await expectMentionEvents(plutoUserModel, [{
          user_id:            plutoUserModel.intId,
          event_type:         'mention_in_comment',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     plutoUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }]);
      });

      it('should not create mention_in_comment event for group', async () => {
        await createGroupAsync(luna, 'dubhe');
        await createCommentAsync(luna, post.id, 'Mentioning @dubhe');
        await expectNoEventsOfTypes(['mention_in_comment']);
      });

      it('should create mention_in_comment event with proper group_id for comment to post in group', async () => {
        const dubhe = await createGroupAsync(luna, 'dubhe');
        const dubheGroupModel = await dbAdapter.getGroupById(dubhe.group.id);
        const privatePost = await createAndReturnPostToFeed(dubhe, luna, 'Group post');
        await createCommentAsync(luna, privatePost.id, 'Mentioning @mars');
        await expectMentionEvents(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'mention_in_comment',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
          group_id:           dubheGroupModel.intId,
          post_author_id:     lunaUserModel.intId,
        }]);
      });

      it('should create mention_comment_to event with proper group_id for comment to post in group', async () => {
        const dubhe = await createGroupAsync(luna, 'dubhe');
        const dubheGroupModel = await dbAdapter.getGroupById(dubhe.group.id);
        const privatePost = await createAndReturnPostToFeed(dubhe, luna, 'Group post');
        await createCommentAsync(luna, privatePost.id, 'Mentioning @mars');
        await expectMentionEvents(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'mention_in_comment',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
          group_id:           dubheGroupModel.intId,
          post_author_id:     lunaUserModel.intId,
        }]);
      });

      it('should not create mention_in_comment event for not-existent user', async () => {
        await createCommentAsync(luna, post.id, 'Mentioning @notexistent');
        await expectNoEventsOfTypes(['mention_in_comment']);
      });

      it('should not create mention_in_comment event for mentioned user who banned post author', async () => {
        await banUser(mars, luna);
        await createCommentAsync(luna, post.id, 'Mentioning @mars');
        await expectMentionEvents(marsUserModel, []);
        await expectMentionEvents(lunaUserModel, []);
      });

      it('should not create mention_in_comment event for mentioned user who banned comment author', async () => {
        await banUser(mars, jupiter);
        await createCommentAsync(jupiter, post.id, 'Mentioning @mars');
        await expectMentionEvents(marsUserModel, []);
        await expectMentionEvents(lunaUserModel, []);
        await expectMentionEvents(jupiterUserModel, []);
      });

      it('should not create mention_in_comment event for mentioned user banned by post author', async () => {
        await banUser(luna, mars);
        await createCommentAsync(luna, post.id, 'Mentioning @mars');
        await expectMentionEvents(marsUserModel, []);
        await expectMentionEvents(lunaUserModel, []);
      });

      it('should not create mention_in_comment event for mentioned user banned by comment author', async () => {
        await banUser(jupiter, mars);
        await createCommentAsync(jupiter, post.id, 'Mentioning @mars');
        await expectMentionEvents(marsUserModel, []);
        await expectMentionEvents(lunaUserModel, []);
        await expectMentionEvents(jupiterUserModel, []);
      });

      it('should not create mention_in_comment event for user who was mentioned in comment to private post of non-friend', async () => {
        const privatePost = await createAndReturnPostToFeed(jupiter, jupiter, 'Private post');
        await createCommentAsync(jupiter, privatePost.id, 'Mentioning @mars, @luna');
        await expectMentionEvents(lunaUserModel, [{
          user_id:            lunaUserModel.intId,
          event_type:         'mention_in_comment',
          created_by_user_id: jupiterUserModel.intId,
          target_user_id:     lunaUserModel.intId,
          post_author_id:     jupiterUserModel.intId,
        }]);
        await expectMentionEvents(marsUserModel, []);
      });

      it('should create only one mention_in_comment event for mentioned user for one post', async () => {
        await createCommentAsync(luna, post.id, 'Mentioning @mars, @mars, @mars @mars @mars @mars @mars @mars @mars!11');
        await expectMentionEvents(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'mention_in_comment',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
          post_author_id:     lunaUserModel.intId,
        }]);
      });
    });
  });

  describe('cascading', () => {
    let luna, mars;
    let lunaUserModel, marsUserModel;

    beforeEach(async () => {
      [luna, mars] = await Promise.all([
        createUserAsync('luna', 'pw'),
        createUserAsync('mars', 'pw'),
      ]);

      [lunaUserModel, marsUserModel] = await dbAdapter.getUsersByIds([
        luna.user.id,
        mars.user.id,
      ]);
    });

    describe("event shouldn't be deleted when", () => {
      it('related post deleted', async () => {
        const post = await createAndReturnPostToFeed(luna, luna, 'Mentioning @mars');
        await deletePostAsync(luna, post.id);
        await expectUserEventsToBe(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'mention_in_post',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
        }]);
      });

      it('related comment deleted', async () => {
        const post = await createAndReturnPostToFeed(luna, luna, 'Test post');
        const comment = await createCommentAsync(luna, post.id, 'Mentioning @mars');
        await removeCommentAsync(luna, comment.id);
        await expectUserEventsToBe(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'mention_in_comment',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
        }]);
      });

      it('related group deleted', async () => {
        const dubhe = await createGroupAsync(luna, 'dubhe');
        const dubheGroupModel = await dbAdapter.getGroupById(dubhe.group.id);
        await dbAdapter.deleteUser(dubhe.group.id);
        await expectUserEventsToBe(lunaUserModel, [{
          user_id:            lunaUserModel.intId,
          event_type:         'group_created',
          created_by_user_id: lunaUserModel.intId,
          group_id:           dubheGroupModel.intId,
        }]);
      });

      it('related target_user deleted', async () => {
        await banUser(luna, mars);
        await dbAdapter.deleteUser(mars.user.id);
        await expectUserEventsToBe(lunaUserModel, [{
          user_id:            lunaUserModel.intId,
          event_type:         'banned_user',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
        }]);
      });

      it('related created_by_user deleted', async () => {
        await subscribeToAsync(mars, luna);
        await dbAdapter.deleteUser(mars.user.id);
        await expectUserEventsToBe(lunaUserModel, [{
          user_id:            lunaUserModel.intId,
          event_type:         'user_subscribed',
          created_by_user_id: marsUserModel.intId,
          target_user_id:     lunaUserModel.intId,
        }]);
      });
    });

    describe('event should be deleted when', () => {
      it('recipient user deleted', async () => {
        await subscribeToAsync(mars, luna);
        await expectUserEventsToBe(lunaUserModel, [{
          user_id:            lunaUserModel.intId,
          event_type:         'user_subscribed',
          created_by_user_id: marsUserModel.intId,
          target_user_id:     lunaUserModel.intId,
        }]);
        await dbAdapter.deleteUser(luna.user.id);
        await expectUserEventsToBe(lunaUserModel, []);
      });
    });
  });
});

describe('EventsController', () => {
  before(async () => {
    PubSub.setPublisher(new DummyPublisher());
  });

  beforeEach(async () => {
    await knexCleaner.clean($pg_database);
  });

  describe('myEvents', () => {
    let luna, mars, lunaUserModel, marsUserModel;

    beforeEach(async () => {
      [luna, mars] = await Promise.all([
        createUserAsync('luna', 'pw'),
        createUserAsync('mars', 'pw')
      ]);

      [lunaUserModel, marsUserModel] = await dbAdapter.getUsersByIds([
        luna.user.id,
        mars.user.id
      ]);

      await mutualSubscriptions([luna, mars]);
    });

    it('should return user events', async () => {
      await dbAdapter.createEvent(lunaUserModel.intId, 'banned_user', lunaUserModel.intId, marsUserModel.intId);
      let res = await getUserEvents(luna);
      expect(res, 'to satisfy', {
        Notifications: [
          {
            eventId:          schema.UUID,
            event_type:       'banned_user',
            created_user_id:  luna.user.id,
            affected_user_id: mars.user.id,
          }, {
            eventId:          schema.UUID,
            event_type:       'user_subscribed',
            created_user_id:  mars.user.id,
            affected_user_id: luna.user.id,
          }
        ]
      });
      expect(res.users, 'to have length', 2);
      expect(res.users, 'to have an item satisfying', { id: luna.user.id });
      expect(res.users, 'to have an item satisfying', { id: mars.user.id });
      res = await getUserEvents(mars);
      expect(res, 'to satisfy', {
        Notifications: [
          {
            eventId:          schema.UUID,
            event_type:       'user_subscribed',
            created_user_id:  luna.user.id,
            affected_user_id: mars.user.id,
          }
        ]
      });
      expect(res.users, 'to have length', 2);
      expect(res.users, 'to have an item satisfying', { id: luna.user.id });
      expect(res.users, 'to have an item satisfying', { id: mars.user.id });
    });

    it('response should include user and group payload', async () => {
      const dubhe = await createGroupAsync(luna, 'dubhe');
      await subscribeToAsync(mars, dubhe);
      const res = await getUserEvents(luna);
      expect(res.users, 'to have length', 2);
      expect(res.users, 'to have an item satisfying', { id: luna.user.id });
      expect(res.users, 'to have an item satisfying', { id: mars.user.id });
      expect(res.groups, 'to have length', 1);
      expect(res.groups, 'to have an item satisfying', { id: dubhe.group.id });
    });

    describe('type filtering', () => {
      beforeEach(async () => {
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'mention_in_post' });
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'mention_in_comment' });
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'mention_comment_to' });
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'banned_user' });
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'unbanned_user' });
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'banned_by_user' });
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'unbanned_by_user' });
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'user_subscribed' });
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'user_unsubscribed' });
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'subscription_requested' });
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'subscription_request_revoked' });
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'subscription_request_approved' });
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'subscription_request_rejected' });
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'group_created' });
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'group_subscribed' });
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'group_unsubscribed' });
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'group_subscription_requested' });
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'group_subscription_request_revoked' });
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'group_subscription_approved' });
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'group_subscription_rejected' });
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'group_admin_promoted' });
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'group_admin_demoted' });
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'direct' });
        await dbAdapter.database('events').insert({ user_id: lunaUserModel.intId, event_type: 'direct_comment' });
      });

      it('should filter events by type', async () => {
        let res = await getUserEvents(luna, ['mentions']);
        expect(res, 'to satisfy', {
          Notifications: [
            { event_type: 'mention_comment_to' },
            { event_type: 'mention_in_comment' },
            { event_type: 'mention_in_post' },
          ]
        });

        res = await getUserEvents(luna, ['bans']);
        expect(res, 'to satisfy', {
          Notifications: [
            { event_type: 'unbanned_user' },
            { event_type: 'banned_user' },
          ]
        });

        res = await getUserEvents(luna, ['subscriptions']);
        expect(res['Notifications'], 'to have length', 7);

        res = await getUserEvents(luna, ['groups']);
        expect(res['Notifications'], 'to have length', 9);

        res = await getUserEvents(luna, ['directs']);
        expect(res, 'to satisfy', {
          Notifications: [
            { event_type: 'direct_comment' },
            { event_type: 'direct' },
          ]
        });

        res = await getUserEvents(luna, ['bans', 'directs']);
        expect(res, 'to satisfy', {
          Notifications: [
            { event_type: 'direct_comment' },
            { event_type: 'direct' },
            { event_type: 'unbanned_user' },
            { event_type: 'banned_user' },
          ]
        });
      });
    });

    it('should not return banned_by_user and unbanned_by_user events', async () => {
      await dbAdapter.createEvent(lunaUserModel.intId, 'banned_by_user', lunaUserModel.intId, marsUserModel.intId);
      await dbAdapter.createEvent(lunaUserModel.intId, 'unbanned_by_user', lunaUserModel.intId, marsUserModel.intId);
      const res = await getUserEvents(luna);
      expect(res, 'to satisfy', {
        Notifications: [
          {
            event_type:       'user_subscribed',
            created_user_id:  mars.user.id,
            affected_user_id: luna.user.id,
          }
        ]
      });
    });

    describe('events pagination', () => {
      beforeEach(async () => {
        const promises = [];
        for (let i = 0; i < 40; i++) {
          promises.push(dbAdapter.createEvent(lunaUserModel.intId, 'banned_user', lunaUserModel.intId, marsUserModel.intId));
        }
        await Promise.all(promises);
      });

      it('should paginate events with default page size 30', async () => {
        let res = await getUserEvents(luna);
        let events = res['Notifications'];
        expect(events, 'to be an array');
        expect(events, 'to have length', 30);
        for (let i = 0; i < 30; i++) {
          expect(events[i], 'to satisfy', {
            event_type:       'banned_user',
            created_user_id:  luna.user.id,
            affected_user_id: mars.user.id,
          });
        }
        expect(res, 'to satisfy', { isLastPage: false });

        res = await getUserEvents(luna, null, null, 30);
        events = res['Notifications'];
        expect(events, 'to be an array');
        expect(events, 'to have length', 11);
        for (let i = 0; i < 10; i++) {
          expect(events[i], 'to satisfy', {
            event_type:       'banned_user',
            created_user_id:  luna.user.id,
            affected_user_id: mars.user.id,
          });
        }
        expect(events[10], 'to satisfy', {
          event_type:       'user_subscribed',
          created_user_id:  mars.user.id,
          affected_user_id: luna.user.id,
        });
        expect(res, 'to satisfy', { isLastPage: true });
      });

      it('should support custom page sizes', async () => {
        let res = await getUserEvents(luna, null, 40);
        let events = res['Notifications'];
        expect(events, 'to be an array');
        expect(events, 'to have length', 40);
        expect(res, 'to satisfy', { isLastPage: false });

        res = await getUserEvents(luna, null, 40, 40);
        events = res['Notifications'];
        expect(events, 'to be an array');
        expect(events, 'to have length', 1);
        expect(res, 'to satisfy', { isLastPage: true });

        res = await getUserEvents(luna, null, 40, 20);
        events = res['Notifications'];
        expect(events, 'to be an array');
        expect(events, 'to have length', 21);
        expect(res, 'to satisfy', { isLastPage: true });

        res = await getUserEvents(luna, null, 10, 0);
        events = res['Notifications'];
        expect(events, 'to be an array');
        expect(events, 'to have length', 10);
        expect(res, 'to satisfy', { isLastPage: false });
      });
    });

    describe('date filtering', () => {
      beforeEach(async () => {
        await dbAdapter.database('events').insert({
          user_id:            lunaUserModel.intId,
          created_at:         new Date('2015-01-01 00:00'),
          event_type:         'banned_user',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId
        });
      });

      it('should filter out entries older than startDate', async () => {
        const res = await getUserEvents(luna, null, null, null, (new Date('2017-01-01')).toISOString());
        const events = res['Notifications'];
        expect(events, 'to be an array');
        expect(events, 'to have length', 1);
        expect(res, 'to satisfy', { isLastPage: true });
        expect(events[0], 'to satisfy', {
          event_type:       'user_subscribed',
          created_user_id:  mars.user.id,
          affected_user_id: luna.user.id,
        });
      });

      it('should filter out entries newer than endDate', async () => {
        const res = await getUserEvents(luna, null, null, null, null, (new Date('2017-01-01')).toISOString());
        const events = res['Notifications'];
        expect(events, 'to be an array');
        expect(events, 'to have length', 1);
        expect(res, 'to satisfy', { isLastPage: true });
        expect(events[0], 'to satisfy', {
          event_type:       'banned_user',
          created_user_id:  luna.user.id,
          affected_user_id: mars.user.id,
        });
      });

      it('should return only entries that match specified interval', async () => {
        let res = await getUserEvents(luna, null, null, null, (new Date('2014-12-31 23:55')).toISOString(), (new Date('2015-01-01 00:05')).toISOString());
        let events = res['Notifications'];
        expect(events, 'to be an array');
        expect(events, 'to have length', 1);
        expect(res, 'to satisfy', { isLastPage: true });
        expect(events[0], 'to satisfy', {
          event_type:       'banned_user',
          created_user_id:  luna.user.id,
          affected_user_id: mars.user.id,
        });

        res = await getUserEvents(luna, null, null, null, (new Date('2015-01-01 00:05')).toISOString(), (new Date('2015-01-01 00:06')).toISOString());
        events = res['Notifications'];
        expect(events, 'to be an array');
        expect(events, 'to have length', 0);
        expect(res, 'to satisfy', { isLastPage: true });
      });
    });
  });
});
