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
  createAndReturnPostToFeed,
} from './functional_test_helper';


describe('Hide information of private/protected groups', () => {
  before(() => cleanDB($pg_database))

  describe('Luna creates a public Selenites group and wrote post to group and her feed, Mars and Venus are not members', () => {
    let luna, mars, venus, selenites, post;
    before(async () => {
      [luna, mars, venus] = await createTestUsers(3);
      selenites = await createGroupAsync(luna, 'selenites');
      post = await createAndReturnPostToFeed([luna, selenites], luna, 'hi!');
    });

    // Group info

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

    // Subscriptions

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

    // Post info

    it('should return Selenites admins in post info response to anonymous', async () => {
      const resp = await getPostInfo(post);
      expect(resp, 'to satisfy', {
        subscribers: expect.it('to have an item satisfying', {
          id:             selenites.group.id,
          administrators: [luna.user.id],
        })
      });
    });

    describe('group becomes protected', () => {
      before(() => groupToProtected(selenites.group, luna));

      // Group info

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

      // Subscriptions

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

      // Post info

      it('should not return Selenites admins in post info response to anonymous', async () => {
        const resp = await getPostInfo(post);
        expect(resp, 'to satisfy', {
          subscribers: expect.it('to have an item satisfying', {
            id:             selenites.group.id,
            administrators: [],
          })
        });
      });

      it('should return Selenites admins in post info response to Mars', async () => {
        const resp = await getPostInfo(post, mars);
        expect(resp, 'to satisfy', {
          subscribers: expect.it('to have an item satisfying', {
            id:             selenites.group.id,
            administrators: [luna.user.id],
          })
        });
      });
    });

    describe('group becomes private', () => {
      before(() => groupToPrivate(selenites.group, luna));

      // Group info

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

      // Subscriptions

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

      // Post info

      it('should not return Selenites admins in post info response to anonymous', async () => {
        const resp = await getPostInfo(post);
        expect(resp, 'to satisfy', {
          subscribers: expect.it('to have an item satisfying', {
            id:             selenites.group.id,
            administrators: [],
          })
        });
      });

      it('should not return Selenites admins in post info response to Mars', async () => {
        const resp = await getPostInfo(post, mars);
        expect(resp, 'to satisfy', {
          subscribers: expect.it('to have an item satisfying', {
            id:             selenites.group.id,
            administrators: [],
          })
        });
      });

      it('should return Selenites admins in post info response to Luna', async () => {
        const resp = await getPostInfo(post, luna);
        expect(resp, 'to satisfy', {
          subscribers: expect.it('to have an item satisfying', {
            id:             selenites.group.id,
            administrators: [luna.user.id],
          })
        });
      });
    });

    describe('Mars subscribes to group', () => {
      before(async () => {
        await sendRequestToJoinGroup(mars, selenites);
        await acceptRequestToJoinGroup(luna, mars, selenites);
      });

      // Group info

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

      // Subscriptions

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

      // Post info

      it('should return Selenites admins in post info response to Mars', async () => {
        const resp = await getPostInfo(post, mars);
        expect(resp, 'to satisfy', {
          subscribers: expect.it('to have an item satisfying', {
            id:             selenites.group.id,
            administrators: [luna.user.id],
          })
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

function getPostInfo(post, viewerCtx = null) {
  return performJSONRequest('GET', `/v2/posts/${post.id}?authToken=${viewerCtx ? viewerCtx.authToken : ''}`);
}
