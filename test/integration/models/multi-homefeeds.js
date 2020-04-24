/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../../dbCleaner'
import { User, Timeline, dbAdapter } from '../../../app/models';


describe(`HomeFeeds-related methods`, () => {
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
})
