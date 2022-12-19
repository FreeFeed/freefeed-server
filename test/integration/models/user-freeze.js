/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import { User } from '../../../app/models';
import cleanDB from '../../dbCleaner';

describe(`Frozen users`, () => {
  /** @type User */
  let luna;

  before(async () => {
    await cleanDB($pg_database);

    luna = new User({
      username: 'luna',
      screenName: 'Luna Lovegood',
      password: 'pw',
    });
    await luna.create();
  });

  it(`should not be frozen by default`, async () => {
    expect(await luna.isFrozen(), 'to be false');
  });

  it(`should freeze Luna`, async () => {
    await luna.freeze(10); // 10 sec
    expect(await luna.isFrozen(), 'to be true');
  });

  it(`should unfreeze Luna`, async () => {
    await luna.freeze(0);
    expect(await luna.isFrozen(), 'to be false');
  });
});
