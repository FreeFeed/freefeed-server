/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../../dbCleaner'
import { User, Timeline, dbAdapter } from '../../../app/models';


describe(`Multiple home feeds`, () => {
  describe(`Home feeds management`, () => {
    before(() => cleanDB($pg_database));

    let luna,
      mainHomeFeed,
      secondaryHomeFeed,
      tertiaryHomeFeed;

    before(async () => {
      luna = new User({ username: 'luna', password: 'pw' });
      await luna.create();
    });

    it(`main homefeed should have a proper fields`, async () => {
      mainHomeFeed = await luna.getRiverOfNewsTimeline();
      expect(mainHomeFeed, 'to satisfy', { title: Timeline.defaultRiverOfNewsTitle, isInherent: true });
    });

    it(`should return initial list of Luna's homefeeds`, async () => {
      const homefeeds = await luna.getHomeFeeds();
      expect(homefeeds, 'to satisfy', [mainHomeFeed]);
    });

    it(`should add a second and third home feeds`, async () => {
      secondaryHomeFeed = await luna.createHomeFeed('The Second One');
      tertiaryHomeFeed = await luna.createHomeFeed('The Third One');
      expect(secondaryHomeFeed, 'to satisfy', { title: 'The Second One', name: 'RiverOfNews', isInherent: false });
      expect(tertiaryHomeFeed, 'to satisfy', { title: 'The Third One', name: 'RiverOfNews', isInherent: false });
    });

    it(`should return list of three Luna's homefeeds`, async () => {
      const homefeeds = await luna.getHomeFeeds();
      expect(homefeeds, 'to satisfy', [
        mainHomeFeed,
        secondaryHomeFeed,
        tertiaryHomeFeed,
      ]);
    });

    it(`should remove the second homefeed`, async () => {
      const ok = await secondaryHomeFeed.destroy();
      expect(ok, 'to be true');

      const homefeeds = await luna.getHomeFeeds();
      expect(homefeeds, 'to satisfy', [
        mainHomeFeed,
        tertiaryHomeFeed,
      ]);
    });

    it(`shouldn't remove the main homefeed`, async () => {
      const ok = await mainHomeFeed.destroy();
      expect(ok, 'to be false');

      const homefeeds = await luna.getHomeFeeds();
      expect(homefeeds, 'to satisfy', [
        mainHomeFeed,
        tertiaryHomeFeed,
      ]);
    });

    it(`should add a second home feed again`, async () => {
      secondaryHomeFeed = await luna.createHomeFeed('The Second One');

      const homefeeds = await luna.getHomeFeeds();
      expect(homefeeds, 'to satisfy', [
        mainHomeFeed,
        tertiaryHomeFeed,
        secondaryHomeFeed,
      ]);
    });

    it(`should update the second home feed`, async () => {
      const ok = await secondaryHomeFeed.update({ title: 'The Updated Second One' });
      expect(ok, 'to be true');

      const homefeeds = await luna.getHomeFeeds();
      expect(homefeeds, 'to satisfy', [
        mainHomeFeed,
        tertiaryHomeFeed,
        secondaryHomeFeed,
      ]);
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
      expect(homefeeds, 'to satisfy', [
        mainHomeFeed,
        secondaryHomeFeed,
        tertiaryHomeFeed,
      ]);
    });
  });

  describe('Individual user subscription', () => {
    before(() => cleanDB($pg_database));

    let luna, mars,
      mainHomeFeed,
      secondaryHomeFeed,
      tertiaryHomeFeed;

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

        expect(await luna.subscribeTo(mars, { homeFeedIds: [feed.id] }),
          'to be true');

        expect(await luna.getHomeFeedIdsSubscribedTo(mars),
          'to equal', [feed.id]);

        expect(await feed.destroy(),
          'to be true');

        expect(await luna.getHomeFeedIdsSubscribedTo(mars),
          'to equal', [mainHomeFeed.id]);
      });

      it(`should move Mars to the second home feed when it home feed removed`, async () => {
        const feed = await luna.createHomeFeed('Yet another One');

        expect(await luna.subscribeTo(mars, { homeFeedIds: [feed.id] }),
          'to be true');

        expect(await luna.getHomeFeedIdsSubscribedTo(mars),
          'to equal', [feed.id]);

        expect(await feed.destroy({ backupFeedId: secondaryHomeFeed.id }),
          'to be true');

        expect(await luna.getHomeFeedIdsSubscribedTo(mars),
          'to equal', [secondaryHomeFeed.id]);
      });

      it(`should keep Mars in the second home feed when it home feed removed`, async () => {
        const feed = await luna.createHomeFeed('Yet another One');

        expect(await luna.subscribeTo(mars, { homeFeedIds: [feed.id, secondaryHomeFeed.id] }),
          'to be true');

        expect(await luna.getHomeFeedIdsSubscribedTo(mars),
          'when sorted', 'to equal', [feed.id, secondaryHomeFeed.id].sort());

        expect(await feed.destroy({ backupFeedId: secondaryHomeFeed.id }),
          'to be true');

        expect(await luna.getHomeFeedIdsSubscribedTo(mars),
          'to equal', [secondaryHomeFeed.id]);
      });
    });
  });
});
