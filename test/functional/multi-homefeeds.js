/* eslint-env node, mocha */
/* global $database, $pg_database */
import expect from 'unexpected';

import cleanDB from '../dbCleaner';
import { Timeline, PubSub, HOMEFEED_MODE_FRIENDS_ALL_ACTIVITY } from '../../app/models';
import { getSingleton } from '../../app/app';
import { PubSubAdapter } from '../../app/support/PubSubAdapter';

import {
  createTestUser,
  performJSONRequest,
  createTestUsers,
  goPrivate,
  createAndReturnPost,
  createCommentAsync,
  removeCommentAsync,
} from './functional_test_helper';
import {
  homeFeedsListResponse,
  homeFeedsOneResponse,
  homeFeedsSubscriptionsResponse,
} from './schemaV2-helper';
import Session from './realtime-session';


describe(`Multiple home feeds API`, () => {
  let port;

  before(async () => {
    const app = await getSingleton();
    port = process.env.PEPYATKA_SERVER_PORT || app.context.config.port;
    const pubsubAdapter = new PubSubAdapter($database)
    PubSub.setPublisher(pubsubAdapter)
  });

  describe(`Home feeds management`, () => {
    before(() => cleanDB($pg_database));

    let luna, mainHomeFeedId, secondaryHomeFeedId, tertiaryHomeFeedId;

    before(async () => {
      luna = await createTestUser('luna');
    });

    it(`should not return home feed list to anonymous`, async () => {
      const list = await performJSONRequest('GET', '/v2/timelines/home/list');
      expect(list, 'to satisfy', { __httpCode: 401 });
    });

    it(`should return just a main home feed by default to Luna`, async () => {
      const list = await listHomeFeeds(luna);
      expect(list, 'to satisfy', homeFeedsListResponse);
      expect(list, 'to satisfy', {
        timelines: [
          {
            name:       'RiverOfNews',
            user:       luna.user.id,
            title:      Timeline.defaultRiverOfNewsTitle,
            isInherent: true,
          },
        ],
      });
      mainHomeFeedId = list.timelines[0].id;
    });

    it(`should add a second and third home feeds`, async () => {
      {
        const resp = await createHomeFeed(luna, 'The Second One');
        expect(resp, 'to satisfy', homeFeedsOneResponse);
        expect(resp, 'to satisfy', {
          timeline: {
            name:       'RiverOfNews',
            user:       luna.user.id,
            title:      'The Second One',
            isInherent: false,
          },
        });
        secondaryHomeFeedId = resp.timeline.id;
      }

      {
        const resp = await createHomeFeed(luna, 'The Third One');
        expect(resp, 'to satisfy', homeFeedsOneResponse);
        expect(resp, 'to satisfy', {
          timeline: {
            name:       'RiverOfNews',
            user:       luna.user.id,
            title:      'The Third One',
            isInherent: false,
          },
        });
        tertiaryHomeFeedId = resp.timeline.id;
      }
    });

    it(`should return list of three Luna's homefeeds`, async () => {
      const list = await listHomeFeeds(luna);
      expect(list, 'to satisfy', homeFeedsListResponse);
      expect(list, 'to satisfy', {
        timelines: [
          {
            id:         mainHomeFeedId,
            name:       'RiverOfNews',
            user:       luna.user.id,
            title:      Timeline.defaultRiverOfNewsTitle,
            isInherent: true,
          },
          {
            id:         secondaryHomeFeedId,
            name:       'RiverOfNews',
            user:       luna.user.id,
            title:      'The Second One',
            isInherent: false,
          },
          {
            id:         tertiaryHomeFeedId,
            name:       'RiverOfNews',
            user:       luna.user.id,
            title:      'The Third One',
            isInherent: false,
          },
        ],
      });
    });

    it(`should rename the second homefeed`, async () => {
      const resp = await performJSONRequest(
        'PATCH',
        `/v2/timelines/home/${secondaryHomeFeedId}`,
        { title: 'The Updated Second One' },
        { Authorization: `Bearer ${luna.authToken}` }
      );
      expect(resp, 'to satisfy', homeFeedsOneResponse);
      expect(resp, 'to satisfy', {
        timeline: {
          id:    secondaryHomeFeedId,
          title: 'The Updated Second One'
        },
      });
    });

    it(`should move the third home feed up`, async () => {
      const resp = await performJSONRequest(
        'PATCH',
        `/v2/timelines/home/`,
        {
          reorder: [
            tertiaryHomeFeedId,
            secondaryHomeFeedId,
            mainHomeFeedId, // should not be touched
          ]
        },
        { Authorization: `Bearer ${luna.authToken}` }
      );
      expect(resp, 'to satisfy', homeFeedsListResponse);
      expect(resp, 'to satisfy', {
        timelines: [
          { id: mainHomeFeedId },
          { id: tertiaryHomeFeedId },
          { id: secondaryHomeFeedId },
        ],
      });
    });

    it(`should remove the second homefeed`, async () => {
      const resp = await performJSONRequest(
        'DELETE',
        `/v2/timelines/home/${secondaryHomeFeedId}`,
        null,
        { Authorization: `Bearer ${luna.authToken}` }
      );
      expect(resp, 'to satisfy', { __httpCode: 200, backupFeed: mainHomeFeedId });

      const list = await listHomeFeeds(luna);
      expect(list, 'to satisfy', homeFeedsListResponse);
      expect(list, 'to satisfy', { timelines: [{ id: mainHomeFeedId }, { id: tertiaryHomeFeedId }], });
    });

    it(`should not remove the main homefeed`, async () => {
      const resp = await performJSONRequest(
        'DELETE',
        `/v2/timelines/home/${mainHomeFeedId}`,
        null,
        { Authorization: `Bearer ${luna.authToken}` }
      );
      expect(resp, 'to satisfy', { __httpCode: 403 });
    });

    describe('Realtime', () => {
      let lunaSession;
      before(async () => {
        lunaSession = await Session.create(port, 'Luna session');
        await lunaSession.sendAsync('auth', { authToken: luna.authToken });
        await lunaSession.sendAsync('subscribe', { user: [luna.user.id] });
      });

      after(() => lunaSession.disconnect());

      it(`should send message when home feed created`, async () => {
        const event = lunaSession.receive('user:update');
        const [resp] = await Promise.all([
          createHomeFeed(luna, 'The Second One'),
          event,
        ]);
        secondaryHomeFeedId = resp.timeline.id;
        expect(event, 'to be fulfilled with', {
          homeFeeds: [
            { id: mainHomeFeedId },
            { id: tertiaryHomeFeedId },
            { id: secondaryHomeFeedId },
          ]
        });
      });

      it(`should send message when home feeds reordered`, async () => {
        const event = lunaSession.receive('user:update');
        await Promise.all([
          await performJSONRequest(
            'PATCH', `/v2/timelines/home/`,
            {
              reorder: [
                secondaryHomeFeedId,
                tertiaryHomeFeedId,
              ]
            },
            { Authorization: `Bearer ${luna.authToken}` }
          ),
          event,
        ]);
        expect(event, 'to be fulfilled with', {
          homeFeeds: [
            { id: mainHomeFeedId },
            { id: secondaryHomeFeedId },
            { id: tertiaryHomeFeedId },
          ]
        });
      });

      it(`should send message when home feed removed`, async () => {
        const event = lunaSession.receive('user:update');
        await Promise.all([
          await performJSONRequest(
            'DELETE', `/v2/timelines/home/${tertiaryHomeFeedId}`, null,
            { Authorization: `Bearer ${luna.authToken}` }
          ),
          event,
        ]);
        expect(event, 'to be fulfilled with', {
          homeFeeds: [
            { id: mainHomeFeedId },
            { id: secondaryHomeFeedId },
          ]
        });
      });
    });
  });

  describe(`Individual subscription`, () => {
    before(() => cleanDB($pg_database));

    let luna, mars,
      mainHomeFeedId, secondaryHomeFeedId, tertiaryHomeFeedId;

    before(async () => {
      [luna, mars] = await createTestUsers(['luna', 'mars']);
      ({ timelines: [{ id: mainHomeFeedId }] } = await listHomeFeeds(luna));
      ({ timeline: { id: secondaryHomeFeedId } } = await createHomeFeed(luna, 'The Second One'));
      ({ timeline: { id: tertiaryHomeFeedId } } = await createHomeFeed(luna, 'The Third One'));
    });

    it(`should return empty inHomeFeeds for Mars`, async () => {
      const resp = await performJSONRequest(
        'GET', `/v1/users/${mars.user.username}`, null,
        { Authorization: `Bearer ${luna.authToken}` }
      );
      expect(resp, 'to satisfy', { inHomeFeeds: [] });
    });

    it(`should return main home feed in inHomeFeeds after default subscription`, async () => {
      {
        const resp = await performJSONRequest(
          'POST', `/v1/users/${mars.user.username}/subscribe`, null,
          { Authorization: `Bearer ${luna.authToken}` }
        );
        expect(resp, 'to satisfy', { __httpCode: 200 });
      }

      const resp = await performJSONRequest(
        'GET', `/v1/users/${mars.user.username}`, null,
        { Authorization: `Bearer ${luna.authToken}` }
      );
      expect(resp, 'to satisfy', { inHomeFeeds: [mainHomeFeedId] });
    });

    it(`should still return empty inHomeFeeds to anonymous`, async () => {
      const resp = await performJSONRequest(
        'GET', `/v1/users/${mars.user.username}`
      );
      expect(resp, 'to satisfy', { inHomeFeeds: [] });
    });

    it(`should unsubscribe from Mars`, async () => {
      {
        const resp = await performJSONRequest(
          'POST', `/v1/users/${mars.user.username}/unsubscribe`, null,
          { Authorization: `Bearer ${luna.authToken}` }
        );
        expect(resp, 'to satisfy', { __httpCode: 200 });
      }

      const resp = await performJSONRequest(
        'GET', `/v1/users/${mars.user.username}`, null,
        { Authorization: `Bearer ${luna.authToken}` }
      );
      expect(resp, 'to satisfy', { inHomeFeeds: [] });
    });

    it(`should return proper inHomeFeeds after subscription with homeFeeds parameter`, async () => {
      {
        const resp = await performJSONRequest(
          'POST', `/v1/users/${mars.user.username}/subscribe`, { homeFeeds: [secondaryHomeFeedId, tertiaryHomeFeedId] },
          { Authorization: `Bearer ${luna.authToken}` }
        );
        expect(resp, 'to satisfy', { __httpCode: 200 });
      }

      const resp = await performJSONRequest(
        'GET', `/v1/users/${mars.user.username}`, null,
        { Authorization: `Bearer ${luna.authToken}` }
      );
      expect(resp, 'to satisfy', {
        inHomeFeeds: expect.it('when sorted', 'to equal',
          [secondaryHomeFeedId, tertiaryHomeFeedId].sort())
      });
    });

    it(`should update subscription to Mars`, async () => {
      {
        const resp = await performJSONRequest(
          'PUT', `/v1/users/${mars.user.username}/subscribe`, { homeFeeds: [mainHomeFeedId, tertiaryHomeFeedId] },
          { Authorization: `Bearer ${luna.authToken}` }
        );
        expect(resp, 'to satisfy', {
          __httpCode:  200,
          inHomeFeeds: expect.it('when sorted', 'to equal', [mainHomeFeedId, tertiaryHomeFeedId].sort()),
        });
      }

      const resp = await performJSONRequest(
        'GET', `/v1/users/${mars.user.username}`, null,
        { Authorization: `Bearer ${luna.authToken}` }
      );
      expect(resp, 'to satisfy', {
        inHomeFeeds: expect.it('when sorted', 'to equal',
          [mainHomeFeedId, tertiaryHomeFeedId].sort())
      });
    });
  });

  describe(`Subscription request`, () => {
    before(() => cleanDB($pg_database));

    let luna, mars,
      secondaryHomeFeedId, tertiaryHomeFeedId;

    before(async () => {
      [luna, mars] = await createTestUsers(['luna', 'mars']);
      await goPrivate(mars);
      ({ timeline: { id: secondaryHomeFeedId } } = await createHomeFeed(luna, 'The Second One'));
      ({ timeline: { id: tertiaryHomeFeedId } } = await createHomeFeed(luna, 'The Third One'));
    });

    it(`should accept requests with homeFeeds parameter`, async () => {
      const resp = await performJSONRequest(
        'POST', `/v1/users/${mars.user.username}/sendRequest`,
        { homeFeeds: [secondaryHomeFeedId, tertiaryHomeFeedId] },
        { Authorization: `Bearer ${luna.authToken}` }
      );
      expect(resp, 'to satisfy', { __httpCode: 200 });
    });

    it(`should subscribe the desired home feeds to Mars`, async () => {
      {
        const resp = await performJSONRequest(
          'POST', `/v1/users/acceptRequest/${luna.user.username}`,
          null,
          { Authorization: `Bearer ${mars.authToken}` }
        );
        expect(resp, 'to satisfy', { __httpCode: 200 });
      }

      const resp = await performJSONRequest(
        'GET', `/v1/users/${mars.user.username}`, null,
        { Authorization: `Bearer ${luna.authToken}` }
      );
      expect(resp, 'to satisfy', {
        inHomeFeeds: expect.it('when sorted', 'to equal',
          [secondaryHomeFeedId, tertiaryHomeFeedId].sort())
      });
    });
  });

  describe(`Mass subscription management`, () => {
    before(() => cleanDB($pg_database));

    let luna, mars, venus, jupiter,
      mainHomeFeedId, secondaryHomeFeedId, tertiaryHomeFeedId;

    before(async () => {
      [luna, mars, venus, jupiter] = await createTestUsers(['luna', 'mars', 'venus', 'jupiter']);
      ({ timelines: [{ id: mainHomeFeedId }] } = await listHomeFeeds(luna));
      ({ timeline: { id: secondaryHomeFeedId } } = await createHomeFeed(luna, 'The Second One'));
      ({ timeline: { id: tertiaryHomeFeedId } } = await createHomeFeed(luna, 'The Third One'));
    });

    it(`should return empty subscriptions list at start`, async () => {
      const resp = await performJSONRequest(
        'GET', `/v2/timelines/home/subscriptions`, null,
        { Authorization: `Bearer ${luna.authToken}` }
      );
      expect(resp, 'to satisfy', homeFeedsSubscriptionsResponse);
      expect(resp, 'to satisfy', {
        usersInHomeFeeds: [],
        timelines:        [
          { id: mainHomeFeedId },
          { id: secondaryHomeFeedId },
          { id: tertiaryHomeFeedId },
        ]
      });
    });

    it(`should return proper subscriptions when Luna subscribed to users`, async () => {
      await subscribe(luna, mars, [mainHomeFeedId]);
      await subscribe(luna, venus, [secondaryHomeFeedId]);
      await subscribe(luna, jupiter, [mainHomeFeedId, tertiaryHomeFeedId]);

      const resp = await performJSONRequest(
        'GET', `/v2/timelines/home/subscriptions`, null,
        { Authorization: `Bearer ${luna.authToken}` }
      );
      expect(resp, 'to satisfy', homeFeedsSubscriptionsResponse);
      expect(resp, 'to satisfy', {
        usersInHomeFeeds: expect.it(
          'when sorted by', (a, b) => a.id.localeCompare(b.id), 'to satisfy', [
            { id: mars.user.id, homeFeeds: [mainHomeFeedId] },
            { id: venus.user.id, homeFeeds: [secondaryHomeFeedId] },
            {
              id:        jupiter.user.id,
              homeFeeds: expect.it('when sorted', 'to equal', [mainHomeFeedId, tertiaryHomeFeedId].sort())
            },
          ].sort((a, b) => a.id.localeCompare(b.id)))
      });
    });

    it(`should return subscriptions of homefeed`, async () => {
      const resp = await performJSONRequest(
        'GET', `/v2/timelines/home/${mainHomeFeedId}`, null,
        { Authorization: `Bearer ${luna.authToken}` }
      );
      expect(resp, 'to satisfy', homeFeedsOneResponse);
      expect(resp, 'to satisfy', { subscribedTo: expect.it('when sorted', 'to equal', [mars.user.id, jupiter.user.id].sort()) });
    });

    it(`should update subscriptions of homefeed`, async () => {
      {
        const resp = await performJSONRequest(
          'PATCH', `/v2/timelines/home/${mainHomeFeedId}`, { subscribedTo: [venus.user.id] },
          { Authorization: `Bearer ${luna.authToken}` }
        );
        expect(resp, 'to satisfy', homeFeedsOneResponse);
        expect(resp, 'to satisfy', { subscribedTo: [venus.user.id] });
      }

      {
        const resp = await performJSONRequest(
          'GET', `/v2/timelines/home/subscriptions`, null,
          { Authorization: `Bearer ${luna.authToken}` }
        );
        expect(resp, 'to satisfy', homeFeedsSubscriptionsResponse);
        expect(resp, 'to satisfy', {
          usersInHomeFeeds: expect.it(
            'when sorted by', (a, b) => a.id.localeCompare(b.id), 'to satisfy', [
              { id: mars.user.id, homeFeeds: [] },
              {
                id:        venus.user.id,
                homeFeeds: expect.it('when sorted', 'to equal', [mainHomeFeedId, secondaryHomeFeedId].sort()),
              },
              { id: jupiter.user.id, homeFeeds: [tertiaryHomeFeedId] },
            ].sort((a, b) => a.id.localeCompare(b.id)))
        });
      }
    });
  });

  describe(`Home feeds posts`, () => {
    before(() => cleanDB($pg_database));

    let luna, mars, venus, jupiter,
      mainHomeFeedId, secondaryHomeFeedId, tertiaryHomeFeedId,
      lunaPost, marsPost, venusPost, jupiterPost;

    before(async () => {
      [luna, mars, venus, jupiter] = await createTestUsers(['luna', 'mars', 'venus', 'jupiter']);
      ({ timelines: [{ id: mainHomeFeedId }] } = await listHomeFeeds(luna));
      ({ timeline: { id: secondaryHomeFeedId } } = await createHomeFeed(luna, 'The Second One'));
      ({ timeline: { id: tertiaryHomeFeedId } } = await createHomeFeed(luna, 'The Third One'));
      await Promise.all([
        subscribe(luna, mars, [mainHomeFeedId]),
        subscribe(luna, venus, [secondaryHomeFeedId]),
        subscribe(luna, jupiter, [mainHomeFeedId, tertiaryHomeFeedId]),
      ]);

      lunaPost = await createAndReturnPost(luna, 'Luna post');
      marsPost = await createAndReturnPost(mars, 'Mars post');
      venusPost = await createAndReturnPost(venus, 'Venus post');
      jupiterPost = await createAndReturnPost(jupiter, 'Jupiter post');
    });

    it(`should return posts from the main home feed`, async () => {
      const resp = await performJSONRequest(
        'GET', `/v2/timelines/home`, null,
        { Authorization: `Bearer ${luna.authToken}` }
      );
      expect(resp, 'to satisfy', { posts: [jupiterPost, marsPost, lunaPost] });
    });

    it(`should return posts from the second home feed`, async () => {
      const resp = await performJSONRequest(
        'GET', `/v2/timelines/home/${secondaryHomeFeedId}/posts`, null,
        { Authorization: `Bearer ${luna.authToken}` }
      );
      expect(resp, 'to satisfy', { posts: [venusPost] });
    });

    it(`should return posts from the third home feed`, async () => {
      const resp = await performJSONRequest(
        'GET', `/v2/timelines/home/${tertiaryHomeFeedId}/posts`, null,
        { Authorization: `Bearer ${luna.authToken}` }
      );
      expect(resp, 'to satisfy', { posts: [jupiterPost] });
    });

    describe(`Jupiter commented Venus post`, () => {
      let commentId;
      before(async () => {
        ({ id: commentId } = await createCommentAsync(jupiter, venusPost.id, 'Hi!'));
      });
      after(() => removeCommentAsync(jupiter, commentId));

      it(`should return Venus post in the main home feed`, async () => {
        const resp = await performJSONRequest(
          'GET', `/v2/timelines/home`, null,
          { Authorization: `Bearer ${luna.authToken}` }
        );
        expect(resp, 'to satisfy', { timelines: { posts: expect.it(`to contain`, venusPost.id) } });
      });

      it(`should not return Venus post in the third home feed`, async () => {
        const resp = await performJSONRequest(
          'GET', `/v2/timelines/home/${tertiaryHomeFeedId}/posts`, null,
          { Authorization: `Bearer ${luna.authToken}` }
        );
        expect(resp, 'to satisfy', { timelines: { posts: expect.it(`not to contain`, venusPost.id) } });
      });
    });

    describe('Realtime', () => {
      let lunaSession;
      before(async () => {
        lunaSession = await Session.create(port, 'Luna session');
        await lunaSession.sendAsync('auth', { authToken: luna.authToken });
      });

      after(() => lunaSession.disconnect());

      it(`should deliver 'post:new' event to main home feed when Jupiter wrote post`, async () => {
        await lunaSession.sendAsync('subscribe', { timeline: [mainHomeFeedId] });
        const event = lunaSession.receive('post:new');
        await Promise.all([
          createAndReturnPost(jupiter, 'Jupiter post'),
          event,
        ]);
        await lunaSession.sendAsync('unsubscribe', { timeline: [mainHomeFeedId] });
        expect(event, 'to be fulfilled');
      });

      it(`should not deliver 'post:new' event to second home feed when Jupiter wrote post`, async () => {
        await lunaSession.sendAsync('subscribe', { timeline: [secondaryHomeFeedId] });
        const event = lunaSession.notReceive('post:new');
        await Promise.all([
          createAndReturnPost(jupiter, 'Jupiter post'),
          event,
        ]);
        await lunaSession.sendAsync('unsubscribe', { timeline: [secondaryHomeFeedId] });
        expect(event, 'to be fulfilled');
      });

      it(`should deliver 'post:new' event to third home feed when Jupiter wrote post`, async () => {
        await lunaSession.sendAsync('subscribe', { timeline: [tertiaryHomeFeedId] });
        const event = lunaSession.receive('post:new');
        await Promise.all([
          createAndReturnPost(jupiter, 'Jupiter post'),
          event,
        ]);
        await lunaSession.sendAsync('unsubscribe', { timeline: [tertiaryHomeFeedId] });
        expect(event, 'to be fulfilled');
      });

      it(`should not deliver 'comment:new' event to second home feed when Venus comments Luna's post`, async () => {
        await lunaSession.sendAsync('subscribe', { timeline: [secondaryHomeFeedId] });
        const event = lunaSession.notReceive('comment:new');
        await Promise.all([
          createCommentAsync(venus, lunaPost.id, 'Comment'),
          event,
        ]);
        await lunaSession.sendAsync('unsubscribe', { timeline: [secondaryHomeFeedId] });
        expect(event, 'to be fulfilled');
      });

      it(`should not deliver 'comment:new' event to second home feed in wide mode when Venus comments Luna's post`, async () => {
        await lunaSession.sendAsync('subscribe', { timeline: [`${secondaryHomeFeedId}?homefeed-mode=${HOMEFEED_MODE_FRIENDS_ALL_ACTIVITY}`] });
        const event = lunaSession.notReceive('comment:new');
        await Promise.all([
          createCommentAsync(venus, lunaPost.id, 'Comment'),
          event,
        ]);
        await lunaSession.sendAsync('unsubscribe', { timeline: [secondaryHomeFeedId] });
        expect(event, 'to be fulfilled');
      });

      it(`should deliver 'comment:new' event to second home feed when Venus comments Venus' post`, async () => {
        await lunaSession.sendAsync('subscribe', { timeline: [secondaryHomeFeedId] });
        const event = lunaSession.receive('comment:new');
        await Promise.all([
          createCommentAsync(venus, venusPost.id, 'Comment'),
          event,
        ]);
        await lunaSession.sendAsync('unsubscribe', { timeline: [secondaryHomeFeedId] });
        expect(event, 'to be fulfilled');
      });
    });
  });
});

function createHomeFeed(userCtx, title) {
  return performJSONRequest(
    'POST', '/v2/timelines/home', { title },
    { Authorization: `Bearer ${userCtx.authToken}` }
  );
}

function listHomeFeeds(userCtx) {
  return performJSONRequest(
    'GET', '/v2/timelines/home/list', null,
    { Authorization: `Bearer ${userCtx.authToken}` }
  );
}

async function subscribe(subscriber, target, homeFeeds = []) {
  const resp = await performJSONRequest(
    'POST', `/v1/users/${target.user.username}/subscribe`, { homeFeeds },
    { Authorization: `Bearer ${subscriber.authToken}` }
  );
  expect(resp, 'to satisfy', { __httpCode: 200 });
}
