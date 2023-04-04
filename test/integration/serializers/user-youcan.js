/* eslint-env node, mocha */
/* global $pg_database */

import expect from 'unexpected';

import { User, dbAdapter } from '../../../app/models';
import { serializeUsersByIds } from '../../../app/serializers/v2/user';
import cleanDB from '../../dbCleaner';

describe(`'youCan' and 'theyDid' fields`, () => {
  let luna, mars;

  beforeEach(async () => {
    await cleanDB($pg_database);

    luna = new User({
      username: 'luna',
      screenName: 'Luna',
      password: 'pw',
    });
    mars = new User({
      username: 'mars',
      screenName: 'Mars',
      password: 'pw',
    });
    await Promise.all([luna, mars].map((u) => u.create()));
  });

  it(`should serialize user for anonymous viewer`, () => testCommands(mars, null, [], []));
  it(`should serialize user for themselves`, () => testCommands(luna, luna, ['post'], []));
  it(`should serialize user for authorized viewer`, () =>
    testCommands(mars, luna, ['ban', 'subscribe'], []));

  describe(`Mars accepts directs from anyone`, () => {
    beforeEach(() =>
      mars.update({ preferences: { acceptDirectsFrom: User.ACCEPT_DIRECTS_FROM_ALL } }),
    );

    it(`should serialize Mars for Luna with 'dm' command`, () =>
      testCommands(mars, luna, ['ban', 'subscribe', 'dm'], []));
  });

  describe(`Luna banned Mars`, () => {
    beforeEach(() => luna.ban(mars.username));

    it(`should serialize Mars for Luna with 'unban' command`, () =>
      testCommands(mars, luna, ['unban', 'subscribe'], []));

    it(`should serialize Luna for Mars as usual`, () =>
      testCommands(luna, mars, ['ban', 'subscribe'], []));
  });

  describe(`Luna subscribed to Mars`, () => {
    beforeEach(() => luna.subscribeTo(mars));

    it(`should serialize Luna for Mars with 'subscribe' did-command`, () =>
      testCommands(luna, mars, ['dm', 'ban', 'subscribe'], ['subscribe']));

    it(`should serialize Mars for Luna with 'unsubscribe' command`, () =>
      testCommands(mars, luna, ['ban', 'unsubscribe'], []));

    describe(`Mars also subscribed to Luna`, () => {
      beforeEach(() => mars.subscribeTo(luna));

      it(`should serialize Luna for Mars with 'subscribe' did-command`, () =>
        testCommands(luna, mars, ['dm', 'ban', 'unsubscribe'], ['subscribe']));

      it(`should serialize Mars for Luna with 'subscribe' did-command`, () =>
        testCommands(mars, luna, ['dm', 'ban', 'unsubscribe'], ['subscribe']));
    });
  });

  describe(`Mars became private`, () => {
    beforeEach(() => mars.update({ isPrivate: '1' }));

    it(`should serialize Mars for Luna with 'request_subscription' command`, () =>
      testCommands(mars, luna, ['ban', 'request_subscription'], []));

    describe(`Luna sent request to Mars`, () => {
      beforeEach(() => luna.sendSubscriptionRequest(mars.id));

      it(`should serialize Mars for Luna with 'unrequest_subscription' command`, () =>
        testCommands(mars, luna, ['ban', 'unrequest_subscription'], []));

      it(`should serialize Luna for Mars with 'request_subscription' did-command`, () =>
        testCommands(luna, mars, ['ban', 'subscribe'], ['request_subscription']));
    });
  });

  describe(`"dm" action matrix`, () => {
    const testMatrix = {
      'mars subscribed to luna': [true, false],
      'mars opened for directs': [true, false],
      'mars bans luna': [true, false],
    };

    let variants = [{}];

    for (const [key, vals] of Object.entries(testMatrix)) {
      variants = vals.flatMap((val) => variants.map((vs) => ({ ...vs, [key]: val })));
      vals.map((val) => ({ [key]: val }));
    }

    for (const variant of variants) {
      const title = Object.keys(variant)
        .map((key) => {
          if (variant[key]) {
            return key;
          }

          return `NOT (${key})`;
        })
        .join(' and ');

      it(`should test directs allowance from Luna to Mars where ${title}`, async () => {
        if (variant['luna subscribed to mars']) {
          await luna.subscribeTo(mars);
        }

        if (variant['mars subscribed to luna']) {
          await mars.subscribeTo(luna);
        }

        if (variant['mars opened for directs']) {
          await mars.update({ preferences: { acceptDirectsFrom: User.ACCEPT_DIRECTS_FROM_ALL } });
        }

        if (variant['mars bans luna']) {
          await mars.ban(luna.username);
        }

        luna = await dbAdapter.getUserById(luna.id);
        mars = await dbAdapter.getUserById(mars.id);

        const shouldAllow = await mars.acceptsDirectsFrom(luna);

        const ser = await serializeUsersByIds([mars.id], luna.id);
        expect(ser, 'to satisfy', [
          { youCan: expect.it(`${shouldAllow ? '' : 'not '}to contain`, 'dm') },
        ]);
      });
    }
  });
});

async function testCommands(user, viewer, youCan, theyDid) {
  const ser = await serializeUsersByIds([user.id], viewer?.id);
  expect(ser, 'to satisfy', [
    {
      youCan:
        youCan.length > 0 ? expect.it('to only contain', ...youCan) : expect.it('to be empty'),
      theyDid:
        theyDid.length > 0 ? expect.it('to only contain', ...theyDid) : expect.it('to be empty'),
    },
  ]);
}
