/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';
import { zipObject } from 'lodash';

import cleanDB from '../../dbCleaner';
import { User } from '../../../app/models';
import { checkDestNames } from '../../../app/controllers/api/v1/PostsController';

describe('checkDestNames function', () => {
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

  it('shold not allow to Luna to send direct to Jupiter', async () => {
    const call = checkDestNames(['mars', 'venus', 'jupiter'], users.luna);
    await expect(call, 'to be rejected with', /jupiter/);
  });

  it('shold not allow to Luna to send direct to Saturn', async () => {
    const call = checkDestNames(['mars', 'venus', 'saturn'], users.luna);
    await expect(call, 'to be rejected with', /saturn/);
  });

  it('shold not allow to Jupiter to send direct to Luna and Mars', async () => {
    const call = checkDestNames(['luna', 'mars', 'venus'], users.jupiter);
    await expect(call, 'to be rejected with', /luna/).and('to be rejected with', /mars/);
  });
});
