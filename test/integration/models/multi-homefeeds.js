/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../../dbCleaner';
import { User, Timeline, dbAdapter } from '../../../app/models';

describe(`Multiple home feeds`, () => {
  describe(`Home feeds management`, () => {
    before(() => cleanDB($pg_database));

    let luna, mainHomeFeed, secondaryHomeFeed, tertiaryHomeFeed;

    before(async () => {
      luna = new User({ username: 'luna', password: 'pw' });
      await luna.create();
    });

    it(`main homefeed should have a proper fields`, async () => {
      mainHomeFeed = await luna.getRiverOfNewsTimeline();
      expect(mainHomeFeed, 'to satisfy', {
        title: Timeline.defaultRiverOfNewsTitle,
        isInherent: true,
      });
    });

    it(`should return initial list of Luna's homefeeds`, async () => {
      const homefeeds = await luna.getHomeFeeds();
      expect(homefeeds, 'to satisfy', [mainHomeFeed]);
    });

    it(`should add a second and third home feeds`, async () => {
      secondaryHomeFeed = await luna.createHomeFeed('The Second One');
      tertiaryHomeFeed = await luna.createHomeFeed('The Third One');
      expect(secondaryHomeFeed, 'to satisfy', {
        title: 'The Second One',
        name: 'RiverOfNews',
        isInherent: false,
      });
      expect(tertiaryHomeFeed, 'to satisfy', {
        title: 'The Third One',
        name: 'RiverOfNews',
        isInherent: false,
      });
    });

    it(`should return list of three Luna's homefeeds`, async () => {
      const homefeeds = await luna.getHomeFeeds();
      expect(homefeeds, 'to satisfy', [mainHomeFeed, secondaryHomeFeed, tertiaryHomeFeed]);
    });

    it(`should remove the second homefeed`, async () => {
      const params = {};
      const ok = await secondaryHomeFeed.destroy(params);
      expect(ok, 'to be true');
      expect(params, 'to satisfy', { backupFeedId: mainHomeFeed.id });

      const homefeeds = await luna.getHomeFeeds();
      expect(homefeeds, 'to satisfy', [mainHomeFeed, tertiaryHomeFeed]);
    });

    it(`shouldn't remove the main homefeed`, async () => {
      const ok = await mainHomeFeed.destroy();
      expect(ok, 'to be false');

      const homefeeds = await luna.getHomeFeeds();
      expect(homefeeds, 'to satisfy', [mainHomeFeed, tertiaryHomeFeed]);
    });

    it(`should add a second home feed again`, async () => {
      secondaryHomeFeed = await luna.createHomeFeed('The Second One');

      const homefeeds = await luna.getHomeFeeds();
      expect(homefeeds, 'to satisfy', [mainHomeFeed, tertiaryHomeFeed, secondaryHomeFeed]);
    });

    it(`should update the second home feed`, async () => {
      const ok = await secondaryHomeFeed.update({ title: 'The Updated Second One' });
      expect(ok, 'to be true');

      const homefeeds = await luna.getHomeFeeds();
      expect(homefeeds, 'to satisfy', [mainHomeFeed, tertiaryHomeFeed, secondaryHomeFeed]);
    });

    it(`should move the second home feed up`, async () => {
      await dbAdapter.reorderFeeds([
        secondaryHomeFeed.id,
        tertiaryHomeFeed.id,
        mainHomeFeed.id, // should not be touched
      ]);

      // Updating objects
      [secondaryHomeFeed, tertiaryHomeFeed] = await dbAdapter.getTimelinesByIds([
        secondaryHomeFeed.id,
        tertiaryHomeFeed.id,
      ]);

      const homefeeds = await luna.getHomeFeeds();
      expect(homefeeds, 'to satisfy', [mainHomeFeed, secondaryHomeFeed, tertiaryHomeFeed]);
    });
  });

  describe('Individual user subscription', () => {
    before(() => cleanDB($pg_database));

    let luna, mars, mainHomeFeed, secondaryHomeFeed, tertiaryHomeFeed;

    before(async () => {
      luna = new User({ username: 'luna', password: 'pw' });
      mars = new User({ username: 'mars', password: 'pw' });
      await luna.create();
      await mars.create();
      mainHomeFeed = await luna.getRiverOfNewsTimeline();
      secondaryHomeFeed = await luna.createHomeFeed('The Second One');
      tertiaryHomeFeed = await luna.createHomeFeed('The Third One');
    });

    it(`should return empty subscription to Mars`, async () => {
      const feedIds = await luna.getHomeFeedIdsSubscribedTo(mars);
      expect(feedIds, 'to equal', []);
    });

    it(`should add Mars to default home feed`, async () => {
      const ok = await luna.subscribeTo(mars);
      expect(ok, 'to be true');
      const feedIds = await luna.getHomeFeedIdsSubscribedTo(mars);
      expect(feedIds, 'to equal', [mainHomeFeed.id]);
    });

    it(`should add Mars to default and secondary home feeds`, async () => {
      const homeFeedIds = [mainHomeFeed.id, secondaryHomeFeed.id];
      const ok = await luna.setHomeFeedsSubscribedTo(mars, homeFeedIds);
      expect(ok, 'to be true'); // already subscribed
      const feedIds = await luna.getHomeFeedIdsSubscribedTo(mars);
      expect(feedIds, 'when sorted', 'to equal', homeFeedIds.sort());
    });

    it(`should add Mars to tertiary home feed only`, async () => {
      const homeFeedIds = [tertiaryHomeFeed.id];
      const ok = await luna.setHomeFeedsSubscribedTo(mars, homeFeedIds);
      expect(ok, 'to be true'); // already subscribed
      const feedIds = await luna.getHomeFeedIdsSubscribedTo(mars);
      expect(feedIds, 'when sorted', 'to equal', homeFeedIds.sort());
    });

    it(`should unsubscribe from Mars`, async () => {
      const ok = await luna.unsubscribeFrom(mars);
      expect(ok, 'to be true');
      const feedIds = await luna.getHomeFeedIdsSubscribedTo(mars);
      expect(feedIds, 'to equal', []);
    });

    describe('home feed removal', () => {
      afterEach(() => luna.unsubscribeFrom(mars));

      it(`should move Mars to the main home feed when it home feed removed`, async () => {
        const feed = await luna.createHomeFeed('Yet another One');

        expect(await luna.subscribeTo(mars, { homeFeedIds: [feed.id] }), 'to be true');

        expect(await luna.getHomeFeedIdsSubscribedTo(mars), 'to equal', [feed.id]);

        expect(await feed.destroy(), 'to be true');

        expect(await luna.getHomeFeedIdsSubscribedTo(mars), 'to equal', [mainHomeFeed.id]);
      });

      it(`should move Mars to the second home feed when it home feed removed`, async () => {
        const feed = await luna.createHomeFeed('Yet another One');

        expect(await luna.subscribeTo(mars, { homeFeedIds: [feed.id] }), 'to be true');

        expect(await luna.getHomeFeedIdsSubscribedTo(mars), 'to equal', [feed.id]);

        expect(await feed.destroy({ backupFeedId: secondaryHomeFeed.id }), 'to be true');

        expect(await luna.getHomeFeedIdsSubscribedTo(mars), 'to equal', [secondaryHomeFeed.id]);
      });

      it(`should keep Mars in the second home feed when it home feed removed`, async () => {
        const feed = await luna.createHomeFeed('Yet another One');

        expect(
          await luna.subscribeTo(mars, { homeFeedIds: [feed.id, secondaryHomeFeed.id] }),
          'to be true',
        );

        expect(
          await luna.getHomeFeedIdsSubscribedTo(mars),
          'when sorted',
          'to equal',
          [feed.id, secondaryHomeFeed.id].sort(),
        );

        expect(await feed.destroy({ backupFeedId: secondaryHomeFeed.id }), 'to be true');

        expect(await luna.getHomeFeedIdsSubscribedTo(mars), 'to equal', [secondaryHomeFeed.id]);
      });
    });
  });

  describe('Subscription requests', () => {
    before(() => cleanDB($pg_database));

    let luna, mars, mainHomeFeed, secondaryHomeFeed;

    before(async () => {
      luna = new User({ username: 'luna', password: 'pw' });
      mars = new User({ username: 'mars', password: 'pw', isPrivate: '1' });
      await luna.create();
      await mars.create();
      mainHomeFeed = await luna.getRiverOfNewsTimeline();
      secondaryHomeFeed = await luna.createHomeFeed('The Second One');
    });

    it(`should allow Luna to send subscription request to Mars with home feed ids`, async () => {
      expect(await luna.sendSubscriptionRequest(mars.id, [secondaryHomeFeed.id]), 'to be true');

      expect(await luna.getPendingSubscriptionRequests(), 'to satisfy', [{ id: mars.id }]);

      expect(await luna.getHomeFeedIdsSubscribedTo(mars), 'to equal', []);
    });

    it(`should subscribe Luna to Mars with proper home feed when Mars approved request`, async () => {
      expect(await mars.acceptSubscriptionRequest(luna), 'to be true');

      expect(await luna.getPendingSubscriptionRequests(), 'to equal', []);

      expect(await luna.getHomeFeedIdsSubscribedTo(mars), 'to equal', [secondaryHomeFeed.id]);
    });

    it(`should subscribe Luna to Mars with default home feed if the desired home feed was removed`, async () => {
      expect(await luna.unsubscribeFrom(mars), 'to be true');

      expect(await luna.sendSubscriptionRequest(mars.id, [secondaryHomeFeed.id]), 'to be true');

      expect(await await secondaryHomeFeed.destroy(), 'to be true');

      expect(await mars.acceptSubscriptionRequest(luna), 'to be true');

      expect(await luna.getPendingSubscriptionRequests(), 'to equal', []);

      expect(await luna.getHomeFeedIdsSubscribedTo(mars), 'to equal', [mainHomeFeed.id]);
    });
  });

  describe('Mass subscription management', () => {
    before(() => cleanDB($pg_database));

    let luna, mars, venus, jupiter, saturn, mainHomeFeed, secondaryHomeFeed;

    before(async () => {
      luna = new User({ username: 'luna', password: 'pw' });
      mars = new User({ username: 'mars', password: 'pw' });
      venus = new User({ username: 'venus', password: 'pw' });
      jupiter = new User({ username: 'jupiter', password: 'pw' });
      saturn = new User({ username: 'saturn', password: 'pw' });
      await Promise.all([
        luna.create(),
        mars.create(),
        venus.create(),
        jupiter.create(),
        saturn.create(),
      ]);
      [mainHomeFeed, secondaryHomeFeed] = await Promise.all([
        luna.getRiverOfNewsTimeline(),
        luna.createHomeFeed('The Second One'),
      ]);
    });

    it(`should return all home feeds with subscriptions`, async () => {
      expect(await luna.subscribeTo(mars), 'to be true');
      expect(
        await luna.subscribeTo(venus, { homeFeedIds: [mainHomeFeed.id, secondaryHomeFeed.id] }),
        'to be true',
      );
      expect(
        await luna.subscribeTo(jupiter, { homeFeedIds: [secondaryHomeFeed.id] }),
        'to be true',
      );
      expect(await luna.subscribeTo(saturn), 'to be true');
      // Some other user's subscriptions
      expect(await venus.subscribeTo(mars), 'to be true');
      expect(await jupiter.subscribeTo(venus), 'to be true');

      // Exclude Saturn from all home feeds
      expect(await luna.setHomeFeedsSubscribedTo(saturn, []), 'to be true');

      expect(
        await luna.getSubscriptionsWithHomeFeeds(),
        'when sorted by',
        (a, b) => a.user_id.localeCompare(b.user_id),
        'to satisfy',
        [
          { user_id: mars.id, homefeed_ids: [mainHomeFeed.id] },
          {
            user_id: venus.id,
            homefeed_ids: expect.it(
              'when sorted',
              'to equal',
              [mainHomeFeed.id, secondaryHomeFeed.id].sort(),
            ),
          },
          { user_id: jupiter.id, homefeed_ids: [secondaryHomeFeed.id] },
          { user_id: saturn.id, homefeed_ids: [] },
        ].sort((a, b) => a.user_id.localeCompare(b.user_id)),
      );
    });

    it(`should return only mainHomeFeed subscriptions`, async () => {
      expect(
        await mainHomeFeed.getHomeFeedSubscriptions(),
        'when sorted',
        'to satisfy',
        [mars.id, venus.id].sort(),
      );
    });

    it(`should update mainHomeFeed subscriptions`, async () => {
      await mainHomeFeed.updateHomeFeedSubscriptions([saturn.id, venus.id]);

      expect(
        await luna.getSubscriptionsWithHomeFeeds(),
        'when sorted by',
        (a, b) => a.user_id.localeCompare(b.user_id),
        'to satisfy',
        [
          { user_id: mars.id, homefeed_ids: [] },
          {
            user_id: venus.id,
            homefeed_ids: expect.it(
              'when sorted',
              'to equal',
              [mainHomeFeed.id, secondaryHomeFeed.id].sort(),
            ),
          },
          { user_id: jupiter.id, homefeed_ids: [secondaryHomeFeed.id] },
          { user_id: saturn.id, homefeed_ids: [mainHomeFeed.id] },
        ].sort((a, b) => a.user_id.localeCompare(b.user_id)),
      );
    });

    it(`should move all subscriptions to the secondary home feed`, async () => {
      await Promise.all([
        mainHomeFeed.updateHomeFeedSubscriptions([]),
        secondaryHomeFeed.updateHomeFeedSubscriptions([mars.id, venus.id, jupiter.id, saturn.id]),
      ]);

      expect(
        await luna.getSubscriptionsWithHomeFeeds(),
        'when sorted by',
        (a, b) => a.user_id.localeCompare(b.user_id),
        'to satisfy',
        [
          { user_id: mars.id, homefeed_ids: [secondaryHomeFeed.id] },
          { user_id: venus.id, homefeed_ids: [secondaryHomeFeed.id] },
          { user_id: jupiter.id, homefeed_ids: [secondaryHomeFeed.id] },
          { user_id: saturn.id, homefeed_ids: [secondaryHomeFeed.id] },
        ].sort((a, b) => a.user_id.localeCompare(b.user_id)),
      );
    });
  });

  describe('Hide lists', () => {
    before(() => cleanDB($pg_database));

    let luna,
      mars,
      venus,
      jupiter,
      saturn,
      mainHomeFeedLuna,
      secondaryHomeFeedLuna,
      mainHomeFeedMars,
      secondaryHomeFeedMars;

    before(async () => {
      luna = new User({ username: 'luna', password: 'pw' });
      mars = new User({ username: 'mars', password: 'pw' });
      venus = new User({ username: 'venus', password: 'pw' });
      jupiter = new User({ username: 'jupiter', password: 'pw' });
      saturn = new User({ username: 'saturn', password: 'pw' });
      await Promise.all([
        luna.create(),
        mars.create(),
        venus.create(),
        jupiter.create(),
        saturn.create(),
      ]);
      [
        mainHomeFeedLuna,
        secondaryHomeFeedLuna,
        mainHomeFeedMars,
        secondaryHomeFeedMars,
      ] = await Promise.all([
        luna.getRiverOfNewsTimeline(),
        luna.createHomeFeed('The Second One'),
        mars.getRiverOfNewsTimeline(),
        mars.createHomeFeed('The Second One'),
      ]);

      await Promise.all([
        luna.subscribeTo(mars),
        luna.subscribeTo(venus),
        luna.subscribeTo(jupiter),
        mars.subscribeTo(luna),
        mars.subscribeTo(venus),
        mars.subscribeTo(saturn),
      ]);

      await mainHomeFeedLuna.updateHomeFeedSubscriptions([mars.id, venus.id]);
      await secondaryHomeFeedLuna.updateHomeFeedSubscriptions([jupiter.id]);
    });

    function usersPostIntIds(users) {
      return Promise.all(users.map((u) => u.getPostsTimelineIntId()));
    }

    it(`should return hide lists for Luna's home feeds`, async () => {
      {
        const hides = await dbAdapter.getHomeFeedHideListPostIntIds(mainHomeFeedLuna);
        const expected = await usersPostIntIds([jupiter]);
        expect(hides, 'when sorted', 'to equal', expected.sort());
      }

      {
        const hides = await dbAdapter.getHomeFeedHideListPostIntIds(secondaryHomeFeedLuna);
        const expected = await usersPostIntIds([mars, venus]);
        expect(hides, 'when sorted', 'to equal', expected.sort());
      }
    });

    it(`should return hide lists for Mars' home feeds`, async () => {
      {
        const hides = await dbAdapter.getHomeFeedHideListPostIntIds(mainHomeFeedMars);
        const expected = await usersPostIntIds([]);
        expect(hides, 'when sorted', 'to equal', expected.sort());
      }

      {
        const hides = await dbAdapter.getHomeFeedHideListPostIntIds(secondaryHomeFeedMars);
        const expected = await usersPostIntIds([luna, venus, saturn]);
        expect(hides, 'when sorted', 'to equal', expected.sort());
      }
    });

    it(`should return all hide lists for the given feeds`, async () => {
      const lists = await dbAdapter.getHomeFeedsHideLists([
        mainHomeFeedLuna.id,
        secondaryHomeFeedLuna.id,
        mainHomeFeedMars.id,
        secondaryHomeFeedMars.id,
      ]);
      expect(lists, 'to satisfy', {
        [mainHomeFeedLuna.id]: expect.it('when sorted', 'to equal', [jupiter.id].sort()),
        [secondaryHomeFeedLuna.id]: expect.it(
          'when sorted',
          'to equal',
          [mars.id, venus.id].sort(),
        ),
        [mainHomeFeedMars.id]: expect.it('when sorted', 'to equal', [].sort()),
        [secondaryHomeFeedMars.id]: expect.it(
          'when sorted',
          'to equal',
          [luna.id, venus.id, saturn.id].sort(),
        ),
      });
    });
  });
});
