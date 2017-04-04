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
  demoteFromAdmin,
  goPrivate,
  kickOutUserFromGroup,
  mutualSubscriptions,
  promoteToAdmin,
  rejectRequestAsync,
  rejectSubscriptionRequestToGroup,
  sendRequestToSubscribe,
  sendRequestToJoinGroup,
  subscribeToAsync,
  unsubscribeFromAsync,
  unsubscribeUserFromMeAsync,
  unbanUser
} from '../functional/functional_test_helper'

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
      return expectUserEventsToBe(user, expectedEvents, ['group_subscription_requested', 'group_subscription_approved', 'group_subscription_rejected']);
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
        }]);
        await expectPostEvents(jupiterUserModel, [{
          user_id:            jupiterUserModel.intId,
          event_type:         'direct',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     jupiterUserModel.intId,
        }]);
        await expectPostEvents(plutoUserModel, [{
          user_id:            plutoUserModel.intId,
          event_type:         'direct',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     plutoUserModel.intId,
        }]);
      });

      it('should not create direct event on semi-direct post (copy to own post feed) creation for direct sender', async () => {
        await createAndReturnPostToFeed({ username: [luna.username, mars.username] }, luna, 'Direct');
        await expectPostEvents(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'direct',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
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
        }, { event_type: 'direct' }]);
      });

      it("should create direct_comment event on receiver's comment creation for direct sender", async () => {
        const post = await createAndReturnPostToFeed(mars, luna, 'Direct');
        await createCommentAsync(luna, post.id, 'Comment');
        await expectPostEvents(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'direct_comment',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     marsUserModel.intId,
        }, { event_type: 'direct' }]);
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
        }, { event_type: 'direct' }]);
        await expectPostEvents(jupiterUserModel, [{
          user_id:            jupiterUserModel.intId,
          event_type:         'direct_comment',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     jupiterUserModel.intId,
        }, { event_type: 'direct' }]);
        await expectPostEvents(plutoUserModel, [{
          user_id:            plutoUserModel.intId,
          event_type:         'direct_comment',
          created_by_user_id: lunaUserModel.intId,
          target_user_id:     plutoUserModel.intId,
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
        }]);
        await expectPostEvents(marsUserModel, [{
          user_id:            marsUserModel.intId,
          event_type:         'direct_comment',
          created_by_user_id: jupiterUserModel.intId,
          target_user_id:     marsUserModel.intId,
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
});
