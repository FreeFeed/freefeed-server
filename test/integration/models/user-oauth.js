import expect from 'unexpected';
import { omit } from 'lodash';

import cleanDB from '../../dbCleaner';
import { createUserFromOauth } from '../../../config/initializers/passport';
import { dbAdapter } from '../../../app/models';

/* eslint-env node, mocha */
/* global $pg_database */

describe('OAuth user creation', () => {
  describe('createUserFromOauth()', () => {
    const fullData = {
      id:          '124124',
      username:    'johndoe',
      emails:      [{ value: 'JohnDoe@testmail.com' }],
      displayName: 'John Doe',
    };

    afterEach(async () => {
      await cleanDB($pg_database);
    });

    context('when all data is provided', () => {
      before(async () => {
        await createUserFromOauth('facebook', fullData);
      });

      it('should create a user', () => {
        return expect(
          dbAdapter.getUserByUsername('JohnDoe'),
          'to be fulfilled with value satisfying',
          {
            username:   'johndoe',
            screenName: 'John Doe',
            email:      'JohnDoe@testmail.com',
          }
        );
      });
    });

    context('when email is not provided', () => {
      const data = omit(fullData, 'email');

      before(async () => {
        await createUserFromOauth('facebook', data);
      });

      it('should create a user', () => {
        return expect(
          dbAdapter.getUserByUsername('JohnDoe'),
          'to be fulfilled with value satisfying',
          {
            username:   'johndoe',
            screenName: 'John Doe',
          }
        );
      });
    });

    context('when neither id nor email is present', () => {
      const data = omit(fullData, 'id', 'emails');

      it('should fail', () => {
        return expect(
          createUserFromOauth('facebook', data),
          'to be rejected',
        );
      });
    });
  });
});
