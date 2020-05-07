/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../dbCleaner';
import { Timeline } from '../../app/models';

import { createTestUser, performJSONRequest } from './functional_test_helper';
import { homeFeedsListResponse, homeFeedsOneResponse } from './schemaV2-helper';


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
      const list = await performJSONRequest(
        'GET',
        '/v2/timelines/home/list',
        null,
        { Authorization: `Bearer ${luna.authToken}` }
      );
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
        const resp = await performJSONRequest(
          'POST',
          '/v2/timelines/home',
          { title: 'The Second One' },
          { Authorization: `Bearer ${luna.authToken}` }
        );
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
        const resp = await performJSONRequest(
          'POST',
          '/v2/timelines/home',
          { title: 'The Third One' },
          { Authorization: `Bearer ${luna.authToken}` }
        );
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
      const list = await performJSONRequest(
        'GET',
        '/v2/timelines/home/list',
        null,
        { Authorization: `Bearer ${luna.authToken}` }
      );
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

    it(`should remove the second homefeed`, async () => {
      const resp = await performJSONRequest(
        'DELETE',
        `/v2/timelines/home/${secondaryHomeFeedId}`,
        null,
        { Authorization: `Bearer ${luna.authToken}` }
      );
      expect(resp, 'to satisfy', { __httpCode: 200 });

      const list = await performJSONRequest(
        'GET',
        '/v2/timelines/home/list',
        null,
        { Authorization: `Bearer ${luna.authToken}` }
      );
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
});
