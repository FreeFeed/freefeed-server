/* eslint-env node, mocha */
/* global $pg_database */
import unexpected from 'unexpected';
import unexpectedDate from 'unexpected-date';
import { DateTime } from 'luxon';

import { User, dbAdapter } from '../../../app/models';
import cleanDB from '../../dbCleaner';
import { MAX_DATE } from '../../../app/support/constants';

const expect = unexpected.clone();
expect.use(unexpectedDate);

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

  it(`should freeze Luna by ISO date`, async () => {
    const d = DateTime.now().plus({ seconds: 321 }).toJSDate();
    await luna.freeze(d.toISOString());
    expect(await luna.isFrozen(), 'to be true');
    expect(await luna.frozenUntil(), 'to be close to', d);
  });

  it(`should freeze Luna by ISO duration`, async () => {
    const now = await dbAdapter.now();
    await luna.freeze('PT10S');
    expect(await luna.isFrozen(), 'to be true');
    expect(
      await luna.frozenUntil(),
      'to be close to',
      DateTime.fromJSDate(now).plus({ seconds: 10 }).toJSDate(),
    );
  });

  it(`should freeze Luna up to 'Infinity'`, async () => {
    await luna.freeze('Infinity');
    expect(await luna.isFrozen(), 'to be true');
    expect(await luna.frozenUntil(), 'to be close to', MAX_DATE);
  });

  it(`should unfreeze Luna`, async () => {
    await luna.freeze('PT0S');
    expect(await luna.isFrozen(), 'to be false');
    expect(await luna.frozenUntil(), 'to be null');
  });
});
