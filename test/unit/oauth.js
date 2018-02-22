/* eslint-env node, mocha */
import expect from 'unexpected';
import { omit } from 'lodash';

import { generateUsername } from '../../config/initializers/passport';

function getDbAdapter(existingUsername) {
  return {
    // eslint-disable-next-line require-await
    getUserByUsername: async (username) => {
      if (username === existingUsername) {
        return {};
      }
      return null;
    }
  };
}

describe('OAuth utils', () => {
  describe('generateUsername()', () => {
    const dbWithUser = getDbAdapter('johndoe');
    const emptyDb = getDbAdapter();

    context('when data contains username', () => {
      const data = { username: 'john.doe!' };

      it('should return the username', () => {
        return expect(
          generateUsername(emptyDb, data),
          'to be fulfilled with',
          'johndoe'
        );
      });

      context('when user exists', () => {
        it('should return the username with number attached', () => {
          return expect(
            generateUsername(dbWithUser, data),
            'to be fulfilled with',
            'johndoe1'
          );
        });
      });
    });

    context('when data contains email', () => {
      const data = { email: 'john.doe@somemail.com' };

      it('should return the local part of email', () => {
        return expect(
          generateUsername(emptyDb, data),
          'to be fulfilled with',
          'johndoe'
        );
      });

      context('when user exists', () => {
        it('should return the local part of email with number attached', () => {
          return expect(
            generateUsername(dbWithUser, data),
            'to be fulfilled with',
            'johndoe1'
          );
        });
      });
    });

    context('when data contains first and last name', () => {
      const data = { firstName: 'john', lastName: 'd\'oe' };

      it('should return concatenated first and last name', () => {
        return expect(
          generateUsername(emptyDb, data),
          'to be fulfilled with',
          'johndoe'
        );
      });

      context('when user exists', () => {
        it('should return concatenated first and last name with number attached', () => {
          return expect(
            generateUsername(dbWithUser, data),
            'to be fulfilled with',
            'johndoe1'
          );
        });
      });
    });

    context('when provided data is not sufficient', () => {
      it('should throw an error', () => {
        return expect(
          generateUsername(emptyDb, {}),
          'to be rejected'
        );
      });
    });

    describe('data priority', () => {
      const data = {
        username:  'one',
        email:     'two@somemail.com',
        firstName: 'Three',
        lastName:  'Fiddy',
      };

      it('should use username first', () => {
        return expect(
          generateUsername(emptyDb, data),
          'to be fulfilled with',
          'one'
        );
      });

      it('should use email if username is not present', () => {
        return expect(
          generateUsername(emptyDb, omit(data, 'username')),
          'to be fulfilled with',
          'two'
        );
      });

      it('should use full name if there is nothing else', () => {
        return expect(
          generateUsername(emptyDb, omit(data, 'username', 'email')),
          'to be fulfilled with',
          'ThreeFiddy'
        );
      });
    });
  });
});
