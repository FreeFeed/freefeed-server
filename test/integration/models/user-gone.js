/* eslint-env node, mocha */
/* global $pg_database */
import unexpected from 'unexpected';
import unexpectedDate from 'unexpected-date';
import { pick } from 'lodash';

import cleanDB from '../../dbCleaner';
import { User, dbAdapter } from '../../../app/models';
import { GONE_SUSPENDED } from '../../../app/models/user';


const expect = unexpected.clone();
expect.use(unexpectedDate);


describe(`User's 'gone' status`, () => {
  describe(`Clean gone user's fields`, () => {
    let luna;

    before(async () => {
      await cleanDB($pg_database);

      luna = new User({
        username:   'luna',
        screenName: 'Luna Lovegood',
        email:      'luna@lovegood.good',
        password:   'pw',
      });
      await luna.create();
    });

    it(`should return Lunas's props from db`, async () => {
      const luna1 = await dbAdapter.getUserById(luna.id);
      expect(
        pick(luna1, ['username', 'screenName', 'email']),
        'to equal',
        pick(luna, ['username', 'screenName', 'email'])
      );
    });

    it(`should return cleaned Lunas's props when Luna is gone`, async () => {
      const [, now] = await Promise.all([
        luna.setGoneStatus(GONE_SUSPENDED),
        dbAdapter.now(),
      ]);
      const luna1 = await dbAdapter.getUserById(luna.id);
      expect(luna1, 'to satisfy', {
        username:    'luna',
        screenName:  'luna',
        email:       '',
        isPrivate:   '1',
        isProtected: '1',
        goneStatus:  GONE_SUSPENDED,
        goneAt:      expect.it('to be close to', now),
      });
    });

    it(`should return initial Lunas's props when Luna isn't gone anymore`, async () => {
      await luna.setGoneStatus(null);
      const luna1 = await dbAdapter.getUserById(luna.id);
      expect(
        pick(luna1, ['username', 'screenName', 'email']),
        'to equal',
        pick(luna, ['username', 'screenName', 'email'])
      );
    });
  });
});
