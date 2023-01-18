/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../../../dbCleaner';
import { User, dbAdapter } from '../../../../app/models';

describe('Change username', () => {
  beforeEach(() => cleanDB($pg_database));

  let luna, mars;

  beforeEach(async () => {
    luna = new User({ username: 'luna', password: 'pw' });
    mars = new User({ username: 'mars', password: 'pw' });
    await luna.create();
    await mars.create();
  });

  it('should allow to change username luna -> jupiter', () =>
    shouldChangeUsername(luna, 'jupiter'));

  it('should not allow to change username luna -> mars', () =>
    shouldNotChangeUsername(luna, 'mars'));

  describe(`Luna changed username to 'jupiter'`, () => {
    beforeEach(() => shouldChangeUsername(luna, 'jupiter'));

    it(`should have 'luna' record in user_past_names`, async () => {
      const pastNames = await luna.getPastUsernames();
      expect(pastNames, 'to satisfy', [{ username: 'luna' }]);
    });

    it('should not allow to change username mars -> luna', () =>
      shouldNotChangeUsername(mars, 'luna'));

    it('should not allow to change username mars -> jupiter', () =>
      shouldNotChangeUsername(mars, 'jupiter'));

    it('should allow to change username back (jupiter -> luna)', () =>
      shouldChangeUsername(luna, 'luna'));

    it('should return Luna user by jupiter username', async () => {
      const newLuna = await dbAdapter.getFeedOwnerByUsername('jupiter');
      expect(newLuna, 'to satisfy', { id: luna.id, username: 'jupiter' });
    });

    it('should return Luna and Mars user by jupiter and mars usernames', async () => {
      const users = await dbAdapter.getFeedOwnersByUsernames(['jupiter', 'mars']);
      expect(users, 'to have an item satisfying', { id: luna.id });
      expect(users, 'to have an item satisfying', { id: mars.id });
    });

    it('should return Luna user by luna username', async () => {
      const newLuna = await dbAdapter.getFeedOwnerByUsername('luna');
      expect(newLuna, 'to satisfy', { id: luna.id, username: 'jupiter' });
    });

    describe(`Luna quickly changed username back to 'luna'`, () => {
      beforeEach(() => shouldChangeUsername(luna, 'luna'));

      it(`should return empty username history`, async () => {
        const pastNames = await luna.getPastUsernames();
        expect(pastNames, 'to be empty');
      });

      it('should not return Luna user by jupiter username', async () => {
        const newLuna = await dbAdapter.getFeedOwnerByUsername('jupiter');
        expect(newLuna, 'to be null');
      });

      it('should allow to change username mars -> jupiter', () =>
        shouldChangeUsername(mars, 'jupiter'));
    });

    describe(`Luna slowly changed username back to 'luna'`, () => {
      beforeEach(async () => {
        await dbAdapter.database.raw(
          `update user_past_names set valid_till = valid_till - interval '2 hours'`,
        );
        await shouldChangeUsername(luna, 'luna');
      });

      it(`should have 'jupiter' record in user_past_names`, async () => {
        const pastNames = await luna.getPastUsernames();
        expect(pastNames, 'to satisfy', [{ username: 'jupiter' }, { username: 'luna' }]);
      });

      it('should return Luna user by jupiter username', async () => {
        const newLuna = await dbAdapter.getFeedOwnerByUsername('jupiter');
        expect(newLuna, 'to satisfy', { id: luna.id, username: 'luna' });
      });

      it('should not allow to change username mars -> jupiter', () =>
        shouldNotChangeUsername(mars, 'jupiter'));
    });
  });
});

async function shouldChangeUsername(user, username) {
  await user.updateUsername(username);
  const newUser = await dbAdapter.getUserById(user.id);
  expect(newUser, 'to satisfy', { id: user.id, username });
}

async function shouldNotChangeUsername(user, username) {
  const test = user.updateUsername(username);
  await expect(test, 'to be rejected with', /Another user has username/);
}
