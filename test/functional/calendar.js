/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../dbCleaner';
import { getSingleton } from '../../app/app';
import { DummyPublisher } from '../../app/pubsub';
import { PubSub, dbAdapter } from '../../app/models';

import * as funcTestHelper from './functional_test_helper';

describe('CalendarController', () => {
  before(async () => {
    await getSingleton();
    PubSub.setPublisher(new DummyPublisher());
    await cleanDB($pg_database);
  });

  describe('#getMyCalendarYearDays()', () => {
    let luna = {};
    let mars = {};
    let authenticatedAsLuna;

    before(async () => {
      [luna, mars] = await funcTestHelper.createTestUsers(['luna', 'mars']);

      await createPostAtDate(luna, 'luna post 1', '2020-12-31 23:00:01+00');
      await createPostAtDate(luna, 'luna post 2', '2021-01-01 00:00:01+00');
      await createPostAtDate(luna, 'luna post 3', '2021-01-01 01:00:01+00');
      await createPostAtDate(luna, 'luna post 4', '2021-02-01 00:00:01+00');
      await createPostAtDate(luna, 'luna post 5', '2022-01-01 00:00:01+00');
      await createPostAtDate(mars, 'mars post 1', '2021-05-01 00:00:01+00');
      await createPostAtDate(mars, 'mars post 2', '2021-06-01 01:00:01+00');

      authenticatedAsLuna = { 'X-Authentication-Token': luna.authToken };
    });

    it("anonymous cannot read anyone's calendar", async () => {
      const response = await funcTestHelper.performJSONRequest('GET', '/v2/calendar/mars/2022');

      expect(response, 'to satisfy', { err: 'Unauthorized' });
    });

    it("luna cannot read mars's calendar", async () => {
      const response = await funcTestHelper.performJSONRequest(
        'GET',
        '/v2/calendar/mars/2022',
        null,
        authenticatedAsLuna,
      );

      expect(response, 'to satisfy', { err: 'Not found' });
    });

    it('should only work on valid dates', async () => {
      const response = await funcTestHelper.performJSONRequest(
        'GET',
        '/v2/calendar/luna/5000',
        null,
        authenticatedAsLuna,
      );

      expect(response, 'to satisfy', { err: 'Invalid year' });
    });

    it('should only work on valid timezones', async () => {
      const response = await funcTestHelper.performJSONRequest(
        'GET',
        '/v2/calendar/luna/2021?tz=Foo/Bar',
        null,
        authenticatedAsLuna,
      );

      expect(response, 'to satisfy', { err: 'Invalid timezone' });
    });

    it('should return year post counts', async () => {
      const response = await funcTestHelper.performJSONRequest(
        'GET',
        '/v2/calendar/luna/2021?tz=UTC',
        null,
        authenticatedAsLuna,
      );

      expect(response, 'to satisfy', {
        days: [
          { date: '2021-01-01', posts: 2 }, // luna posts 2 and 3
          { date: '2021-02-01', posts: 1 }, // luna post 4
        ],
      });
    });

    it('should correctly take client timezone into account when showing year post counts', async () => {
      const response = await funcTestHelper.performJSONRequest(
        'GET',
        '/v2/calendar/luna/2021?tz=America/Vancouver',
        null,
        authenticatedAsLuna,
      );

      expect(response, 'to satisfy', {
        days: [
          { date: '2021-01-31', posts: 1 }, // luna post 4
          { date: '2021-12-31', posts: 1 }, // luna post 5
        ],
      });
    });

    it('should return month post counts', async () => {
      const response = await funcTestHelper.performJSONRequest(
        'GET',
        '/v2/calendar/luna/2021/01?tz=UTC',
        null,
        authenticatedAsLuna,
      );

      expect(response, 'to satisfy', {
        previousDay: '2020-12-31', // luna post 1
        days: [{ date: '2021-01-01', posts: 2 }], // luna posts 2 and 3
        nextDay: '2021-02-01', // luna post 4
      });
    });

    it('should correctly take client timezone into account when showing month post counts', async () => {
      const response = await funcTestHelper.performJSONRequest(
        'GET',
        '/v2/calendar/luna/2021/01?tz=America/Vancouver',
        null,
        authenticatedAsLuna,
      );

      expect(response, 'to satisfy', {
        previousDay: '2020-12-31', // luna post 3
        days: [{ date: '2021-01-31', posts: 1 }], // luna post 4
        nextDay: '2021-12-31', // luna post 5
      });
    });

    it('should return day posts', async () => {
      const response = await funcTestHelper.performJSONRequest(
        'GET',
        '/v2/calendar/luna/2021/01/01?tz=UTC',
        null,
        authenticatedAsLuna,
      );

      expect(response, 'to satisfy', {
        previousDay: '2020-12-31',
        posts: [
          { createdAt: '1609462801000', body: 'luna post 3' },
          { createdAt: '1609459201000', body: 'luna post 2' },
        ],
        nextDay: '2021-02-01',
        isLastPage: true,
      });
    });

    it('should correctly take client timezone into account when showing day posts', async () => {
      const response = await funcTestHelper.performJSONRequest(
        'GET',
        '/v2/calendar/luna/2021/01/01?tz=America/Vancouver',
        null,
        authenticatedAsLuna,
      );

      expect(response, 'to satisfy', {
        previousDay: '2020-12-31', // luna post 3
        posts: [], // no posts by luna on this day in America/Vancouver tz
        nextDay: '2021-01-31', // luna post 4
        isLastPage: true,
      });
    });

    it("should not return mars's posts to luna", async () => {
      const response = await funcTestHelper.performJSONRequest(
        'GET',
        '/v2/calendar/luna/2021/05/01?tz=UTC',
        null,
        authenticatedAsLuna,
      );

      expect(response, 'to satisfy', {
        previousDay: '2021-02-01', // luna post 4
        posts: [], // no posts by luna on this day
        nextDay: '2022-01-01', // luna post 5
        isLastPage: true,
      });
    });
  });
});

async function createPostAtDate(user, body, date) {
  const response = await funcTestHelper
    .createPostWithCommentsDisabled(user, body)
    .then((r) => r.json());
  const postId = response.posts.id;
  await dbAdapter.database.raw('update posts set created_at = :date where uid = :postId', {
    date,
    postId,
  });
  return postId;
}
