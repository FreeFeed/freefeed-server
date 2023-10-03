/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';
import { zipObject } from 'lodash';

import cleanDB from '../../dbCleaner';
import { User } from '../../../app/models';
import { getDestinationFeeds } from '../../../app/controllers/api/v1/PostsController';

describe('getDestinationFeeds function', () => {
  const userNames = ['luna', 'mars', 'venus', 'jupiter'];
  let users = {};

  before(async () => {
    await cleanDB($pg_database);

    users = zipObject(
      userNames,
      userNames.map((username) => new User({ username, password: 'pw' })),
    );

    await Promise.all(Object.values(users).map((user) => user.create()));

    // Luna and Mars are mutual friends
    // Venus accepts directs from all
    await Promise.all([
      users.luna.subscribeTo(users.mars),
      users.mars.subscribeTo(users.luna),
      users.venus.update({ preferences: { acceptDirectsFrom: User.ACCEPT_DIRECTS_FROM_ALL } }),
    ]);
  });

  it('should allow to Luna to send direct to Mars and Venus', async () => {
    const directFeedIds = await Promise.all(
      [users.luna, users.mars, users.venus].map((u) => u.getDirectsTimelineId()),
    );
    const feeds = await getDestinationFeeds(users.luna, ['mars', 'venus'], null);
    await expect(feeds.map((f) => f.id).sort(), 'to satisfy', directFeedIds.sort());
  });

  it('should not allow to Luna to send direct to Jupiter', async () => {
    const call = getDestinationFeeds(users.luna, ['mars', 'venus', 'jupiter'], null);
    await expect(call, 'to be rejected with', /jupiter/);
  });

  it('should not allow to Luna to send direct to Saturn', async () => {
    const call = getDestinationFeeds(users.luna, ['mars', 'venus', 'saturn'], null);
    await expect(call, 'to be rejected with', /saturn/);
  });

  it('should not allow to Jupiter to send direct to Luna and Mars', async () => {
    const call = getDestinationFeeds(users.jupiter, ['luna', 'mars', 'venus'], null);
    await expect(call, 'to be rejected with', /luna/).and('to be rejected with', /mars/);
  });
});
