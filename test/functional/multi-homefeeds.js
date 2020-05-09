/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../dbCleaner';
import { Timeline } from '../../app/models';

import { createTestUser, performJSONRequest, createTestUsers, goPrivate } from './functional_test_helper';
import { homeFeedsListResponse, homeFeedsOneResponse, homeFeedsSubscriptionsResponse } from './schemaV2-helper';


describe(`Multiple home feeds API`, () => {
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
            userId:     luna.user.id,
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
            userId:     luna.user.id,
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
            userId:     luna.user.id,
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
            userId:     luna.user.id,
            title:      Timeline.defaultRiverOfNewsTitle,
            isInherent: true,
          },
          {
            id:         secondaryHomeFeedId,
            name:       'RiverOfNews',
            userId:     luna.user.id,
            title:      'The Second One',
            isInherent: false,
          },
          {
            id:         tertiaryHomeFeedId,
            name:       'RiverOfNews',
            userId:     luna.user.id,
            title:      'The Third One',
            isInherent: false,
          },
        ],
      });
    });

    it(`should rename the second homefeed`, async () => {
      const resp = await performJSONRequest(
        'PUT',
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
      expect(resp, 'to satisfy', { __httpCode: 200 });

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
        expect(resp, 'to satisfy', { __httpCode: 200 });
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
