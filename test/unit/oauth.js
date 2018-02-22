/* eslint-env node, mocha */
import unexpected from 'unexpected';
import unexpectedSinon from 'unexpected-sinon';
import { omit } from 'lodash';

import { load as configLoader } from '../../config/config';
import {
  generateUsername,
  renderCallbackResponse,
  getAuthParams,
  getAuthzParams,
} from '../../config/initializers/passport';
import { propagateJsdomErrors } from '../utils/jsdom';


const config = configLoader();

const expect = unexpected.clone()
  .use(unexpectedSinon);

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
  const PROVIDERS = ['facebook', 'google', 'github'];
  const AUTHZ_PROVIDERS = ['facebook'];

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

  describe('renderCallbackResponse()', () => {
    // The callback script must post a message in any case.
    context('when neither authToken nor error is provided', () => {
      it('should return HTML with valid script anyway', () => {
        const html = renderCallbackResponse({}, config.origin);

        expect(
          () => propagateJsdomErrors(html),
          'not to throw'
        );
      });

      it('should post a message to the opener anyway', () => {
        const html = renderCallbackResponse({}, config.origin);
        const dom = propagateJsdomErrors(html);

        expect(
          dom.window.opener.postMessage,
          'to have calls satisfying',
          () => {
            dom.window.opener.postMessage({
              authToken: undefined,
              error:     undefined,
            }, config.origin);
          }
        );
      });
    });

    context('when both authToken and error are provided', () => {
      it('should return HTML with valid script', () => {
        const html = renderCallbackResponse({
          authToken: 'token',
          error:     new Error('Some error'),
        }, config.origin);

        expect(
          () => propagateJsdomErrors(html),
          'not to throw'
        );
      });

      it('should post a message to the opener', () => {
        const html = renderCallbackResponse({
          authToken: 'token',
          error:     new Error('Test error'),
        }, config.origin);
        const dom = propagateJsdomErrors(html);

        expect(
          dom.window.opener.postMessage,
          'to have calls satisfying',
          () => {
            dom.window.opener.postMessage({
              authToken: 'token',
              error:     'Test error',
            }, config.origin);
          }
        );
      });
    });
  });

  describe('getAuthParams()', () => {
    for (const provider of PROVIDERS) {
      context(`when called with '${provider}'`, () => {
        it('should return auth parameters', () => {
          expect(
            getAuthParams,
            'when called with',
            [provider],
            'to satisfy',
            { scope: expect.it('to be an', 'array') }
          );
        });
      });
    }

    context('when called with unknown provider name', () => {
      it('should throw', () => {
        expect(() => getAuthParams('unknown_provider'), 'to throw');
      });
    });
  });

  describe('getAuthzParams()', () => {
    for (const provider of AUTHZ_PROVIDERS) {
      context(`when called with '${provider}'`, () => {
        it('should return auth parameters', () => {
          expect(
            getAuthzParams,
            'when called with',
            [provider],
            'to satisfy',
            { scope: expect.it('to be an', 'array') }
          );
        });
      });
    }

    context('when called with unknown provider name', () => {
      it('should throw', () => {
        expect(() => getAuthzParams('unknown_provider'), 'to throw');
      });
    });
  });
});
