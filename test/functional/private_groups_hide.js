/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected'


import cleanDB from '../dbCleaner';
import {
  createTestUsers,
  createGroupAsync,
  groupToProtected,
  groupToPrivate,
  sendRequestToJoinGroup,
  acceptRequestToJoinGroup,
  performJSONRequest,
} from './functional_test_helper';


describe('Admins of private/protected groups', () => {
  before(() => cleanDB($pg_database))

  describe('Luna creates a public Selenites group, Mars and Venus are not members', () => {
    let luna, mars, venus, selenites;
    before(async () => {
      [luna, mars, venus] = await createTestUsers(3);
      selenites = await createGroupAsync(luna, 'selenites');
    });

    it('should return group admins to anonymous', async () => {
      const resp = await getUserInfo(selenites);
      expect(resp, 'to satisfy', {
        users: {
          id:             selenites.group.id,
          administrators: [luna.user.id],
        },
        admins: [{ id: luna.user.id }],
      });
    });

    it('should return group admins to Mars', async () => {
      const resp = await getUserInfo(selenites, mars);
      expect(resp, 'to satisfy', {
        users: {
          id:             selenites.group.id,
          administrators: [luna.user.id],
        },
        admins: [{ id: luna.user.id }],
      });
    });

    it('should return Selenites among Luna subscriptions to anonymous', async () => {
      const resp = await getSubscriptionsOf(luna);
      expect(resp, 'to satisfy', {
        subscribers:   [{ id: selenites.group.id }],
        subscriptions: expect.it('to have items satisfying', { user: selenites.group.id }),
      });
    });

    it('should return Selenites among Luna subscriptions to Mars', async () => {
      const resp = await getSubscriptionsOf(luna, mars);
      expect(resp, 'to satisfy', {
        subscribers:   [{ id: selenites.group.id }],
        subscriptions: expect.it('to have items satisfying', { user: selenites.group.id }),
      });
    });

    describe('group becomes protected', () => {
      before(() => groupToProtected(selenites.group, luna));

      it('should not return group admins to anonymous', async () => {
        const resp = await getUserInfo(selenites);
        expect(resp, 'to satisfy', {
          users: {
            id:             selenites.group.id,
            administrators: [],
          },
          admins: [],
        });
      });

      it('should return group admins to Mars', async () => {
        const resp = await getUserInfo(selenites, mars);
        expect(resp, 'to satisfy', {
          users: {
            id:             selenites.group.id,
            administrators: [luna.user.id],
          },
          admins: [{ id: luna.user.id }],
        });
      });

      it('should not return Selenites among Luna subscriptions to anonymous', async () => {
        const resp = await getSubscriptionsOf(luna);
        expect(resp, 'to satisfy', {
          subscribers:   [],
          subscriptions: [],
        });
      });

      it('should return Selenites among Luna subscriptions to Mars', async () => {
        const resp = await getSubscriptionsOf(luna, mars);
        expect(resp, 'to satisfy', {
          subscribers:   [{ id: selenites.group.id }],
          subscriptions: expect.it('to have items satisfying', { user: selenites.group.id }),
        });
      });
    });

    describe('group becomes private', () => {
      before(() => groupToPrivate(selenites.group, luna));

      it('should not return group admins to anonymous', async () => {
        const resp = await getUserInfo(selenites);
        expect(resp, 'to satisfy', {
          users: {
            id:             selenites.group.id,
            administrators: [],
          },
          admins: [],
        });
      });

      it('should not return group admins to Mars', async () => {
        const resp = await getUserInfo(selenites, mars);
        expect(resp, 'to satisfy', {
          users: {
            id:             selenites.group.id,
            administrators: [],
          },
          admins: [],
        });
      });

      it('should return group admins to Luna', async () => {
        const resp = await getUserInfo(selenites, luna);
        expect(resp, 'to satisfy', {
          users: {
            id:             selenites.group.id,
            administrators: [luna.user.id],
          },
          admins: [{ id: luna.user.id }],
        });
      });


      it('should not return Selenites among Luna subscriptions to anonymous', async () => {
        const resp = await getSubscriptionsOf(luna);
        expect(resp, 'to satisfy', {
          subscribers:   [],
          subscriptions: [],
        });
      });

      it('should not return Selenites among Luna subscriptions to Mars', async () => {
        const resp = await getSubscriptionsOf(luna, mars);
        expect(resp, 'to satisfy', {
          subscribers:   [],
          subscriptions: [],
        });
      });

      it('should return Selenites among Luna subscriptions to Luna', async () => {
        const resp = await getSubscriptionsOf(luna, luna);
        expect(resp, 'to satisfy', {
          subscribers:   [{ id: selenites.group.id }],
          subscriptions: expect.it('to have items satisfying', { user: selenites.group.id }),
        });
      });
    });

    describe('Mars subscribes to group', () => {
      before(async () => {
        await sendRequestToJoinGroup(mars, selenites);
        await acceptRequestToJoinGroup(luna, mars, selenites);
      });

      it('should return group admins to Mars', async () => {
        const resp = await getUserInfo(selenites, mars);
        expect(resp, 'to satisfy', {
          users: {
            id:             selenites.group.id,
            administrators: [luna.user.id],
          },
          admins: [{ id: luna.user.id }],
        });
      });

      it('should not return Selenites among Mars subscriptions to anonymous', async () => {
        const resp = await getSubscriptionsOf(mars);
        expect(resp, 'to satisfy', { subscribers: [], subscriptions: [] });
      });

      it('should not return Selenites among Mars subscriptions to Venus', async () => {
        const resp = await getSubscriptionsOf(mars, venus);
        expect(resp, 'to satisfy', { subscribers: [], subscriptions: [] });
      });

      it('should return Selenites among Mars subscriptions to Luna', async () => {
        const resp = await getSubscriptionsOf(mars, luna);
        expect(resp, 'to satisfy', {
          subscribers:   [{ id: selenites.group.id }],
          subscriptions: expect.it('to have items satisfying', { user: selenites.group.id }),
        });
      });
    });
  });
});

function getUserInfo(userCtx, viewerCtx = null) {
  return performJSONRequest('GET', `/v1/users/${userCtx.username}?authToken=${viewerCtx ? viewerCtx.authToken : ''}`);
}

function getSubscriptionsOf(userCtx, viewerCtx = null) {
  return performJSONRequest('GET', `/v1/users/${userCtx.username}/subscriptions?authToken=${viewerCtx ? viewerCtx.authToken : ''}`);
}
