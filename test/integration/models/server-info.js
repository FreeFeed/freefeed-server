/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import { User, ServerInfo } from '../../../app/models';
import cleanDB from '../../dbCleaner';

describe('ServerInfo model', () => {
  before(() => cleanDB($pg_database));

  describe('isRegistrationOpen', () => {
    const maxCount = 5;
    let i = 0;

    it('should return true when number of registered users is less than maxCount', async () => {
      const users = new Array(maxCount - 1)
        .fill(0)
        .map(() => new User({ username: `user${i++}`, password: 'pw' }));
      await Promise.all(users.map((u) => u.create()));

      const flag = await ServerInfo.isRegistrationOpen({ interval: '1 day', maxCount });
      expect(flag, 'to be true');
    });

    it('should return false when number of registered users is equal to maxCount', async () => {
      const user = new User({ username: `user${i++}`, password: 'pw' });
      await user.create();

      const flag = await ServerInfo.isRegistrationOpen({ interval: '1 day', maxCount });
      expect(flag, 'to be false');
    });

    it('should return false when number of registered users is more than maxCount', async () => {
      const user = new User({ username: `user${i++}`, password: 'pw' });
      await user.create();

      const flag = await ServerInfo.isRegistrationOpen({ interval: '1 day', maxCount });
      expect(flag, 'to be false');
    });
  });
});
