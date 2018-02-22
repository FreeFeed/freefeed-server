/* eslint-env node, mocha */
/* global $pg_database */
import request from 'superagent';
import unexpected from 'unexpected';
import unexpectedSinon from 'unexpected-sinon';
import { omit } from 'lodash';

import cleanDB from '../dbCleaner';
import { getSingleton } from '../../app/app';
import { DummyPublisher } from '../../app/pubsub';
import { PubSub, User } from '../../app/models';
import { propagateJsdomErrors } from '../utils/jsdom';
import { signInAsync } from '../functional/functional_test_helper';


const expect = unexpected.clone()
  .use(unexpectedSinon);

describe('OauthController', () => {
  const PROVIDERS = ['facebook', 'google', 'github'];
  const AUTHZ_PROVIDERS = ['facebook'];

  const providers = PROVIDERS.reduce((acc, cur) => {
    acc[cur] = { id: 1, provider: cur };
    return acc;
  }, {});

  let app;
  before(async () => {
    app = await getSingleton();
    PubSub.setPublisher(new DummyPublisher());
  });

  describe(`#authenticate()`, () => {
    for (const provider of PROVIDERS) {
      context(provider, () => {
        context('when referer is present', () => {
          it('should redirect', (done) => {
            request
              .get(`${app.context.config.host}/v2/oauth/${provider}/auth`)
              .set('Referer', 'http://test.test')
              .redirects(0)
              .end((err, res) => {
                expect(res.status, 'to equal', 302);
                done();
              });
          });
        });

        context('when referer is not present', () => {
          it('should respond with a script postMessage-ing the error', (done) => {
            request
              .get(`${app.context.config.host}/v2/oauth/${provider}/auth`)
              .redirects(0)
              .end((err, res) => {
                const dom = propagateJsdomErrors(res.text);
                expect(
                  dom.window.opener.postMessage,
                  'to have calls satisfying',
                  () => {
                    dom.window.opener.postMessage({
                      authToken: undefined,
                      error:     expect.it('to be a', 'string'),
                    }, '*');
                  }
                );
                done();
              });
          });
        });
      });
    }

    context('when provider is unknown', () => {
      it('should respond with 404 Not Found', (done) => {
        request
          .get(`${app.context.config.host}/v2/oauth/something/auth`)
          .end((err, res) => {
            expect(res.status, 'to equal', 404);
            done();
          });
      });
    });
  });

  describe(`#authenticateCallback()`, () => {
    // These tests do requests to the provider urls. They will fail if those urls cannot be reached.
    for (const provider of PROVIDERS) {
      context(provider, () => {
        it('should respond with a script postMessage-ing an error from provider', (done) => {
          request
            .get(`${app.context.config.host}/v2/oauth/${provider}/callback`)
            .query({ code: 123 })
            .end((err, res) => {
              const dom = propagateJsdomErrors(res.text);
              expect(
                dom.window.opener.postMessage,
                'to have calls satisfying',
                () => {
                  dom.window.opener.postMessage({ error: expect.it('to be a', 'string') }, '*');
                }
              );
              done();
            });
        });
      });
    }

    context('when provider is unknown', () => {
      it('should respond with 404 Not Found', (done) => {
        request
          .get(`${app.context.config.host}/v2/oauth/something/callback`)
          .query({ code: 123 })
          .end((err, res) => {
            expect(res.status, 'to equal', 404);
            done();
          });
      });
    });
  });


  describe(`#authorize()`, () => {
    let authToken;
    beforeEach(async () => {
      const user = await new User({ username: 'testuser', password: 'password', providers }).create();

      for (const provider of AUTHZ_PROVIDERS) {
        // eslint-disable-next-line no-await-in-loop
        await user.addOrUpdateAuthMethod(provider, { id: 1 });
      }

      const response = await signInAsync({ username: 'testuser', password: 'password' });
      ({ authToken } = await response.json());
    });

    afterEach(async () => {
      await cleanDB($pg_database);
    });

    for (const provider of AUTHZ_PROVIDERS) {
      context(provider, () => {
        context('when referer is present', () => {
          it('should redirect', (done) => {
            request
              .get(`${app.context.config.host}/v2/oauth/${provider}/authz`)
              .set('Referer', 'http://test.test')
              .query({ authToken })
              .redirects(0)
              .end((err, res) => {
                expect(res.status, 'to equal', 302);
                done();
              });
          });
        });

        context('when referer is not present', () => {
          it('should respond with a script postMessage-ing an error about referer', (done) => {
            request
              .get(`${app.context.config.host}/v2/oauth/${provider}/authz`)
              .query({ authToken })
              .redirects(0)
              .end((err, res) => {
                const dom = propagateJsdomErrors(res.text);
                expect(
                  dom.window.opener.postMessage,
                  'to have calls satisfying',
                  () => {
                    dom.window.opener.postMessage({ error: 'Referer must be present' }, '*');
                  }
                );
                done();
              });
          });
        });
      });
    }

    context('when provider is unknown', () => {
      it('should respond with 404 Not Found', (done) => {
        request
          .get(`${app.context.config.host}/v2/oauth/something/authz`)
          .end((err, res) => {
            expect(res.status, 'to equal', 404);
            done();
          });
      });
    });
  });

  describe(`#authorizeCallback()`, () => {
    let authToken;
    beforeEach(async () => {
      await new User({ username: 'testuser', password: 'password', providers }).create();
      const response = await signInAsync({ username: 'testuser', password: 'password' });
      ({ authToken } = await response.json());
    });

    afterEach(async () => {
      await cleanDB($pg_database);
    });

    // These tests do requests to the provider urls. They will fail if those urls cannot be reached.
    context('facebook', () => {
      it('should respond with a script postMessage-ing an error from provider', (done) => {
        request
          .get(`${app.context.config.host}/v2/oauth/facebook/authz/callback`)
          .query({ code: 123, authToken })
          .end((err, res) => {
            const dom = propagateJsdomErrors(res.text);
            expect(
              dom.window.opener.postMessage,
              'to have calls satisfying',
              () => {
                dom.window.opener.postMessage({ error: expect.it('to be a', 'string') }, '*');
              }
            );
            done();
          });
      });
    });

    context('when provider is unknown', () => {
      it('should respond with 404 Not Found', (done) => {
        request
          .get(`${app.context.config.host}/v2/oauth/something/authz/callback`)
          .query({ code: 123 })
          .end((err, res) => {
            expect(res.status, 'to equal', 404);
            done();
          });
      });
    });
  });

  describe('#link()', () => {
    let authToken;
    beforeEach(async () => {
      await new User({ username: 'testuser', password: 'password', providers }).create();
      const response = await signInAsync({ username: 'testuser', password: 'password' });
      ({ authToken } = await response.json());
    });

    afterEach(async () => {
      await cleanDB($pg_database);
    });

    for (const provider of PROVIDERS) {
      context(provider, () => {
        context('when referer is present', () => {
          it('should redirect', (done) => {
            request
              .get(`${app.context.config.host}/v2/oauth/${provider}/link`)
              .set('Referer', 'http://test.test')
              .query({ authToken })
              .redirects(0)
              .end((err, res) => {
                expect(res.status, 'to equal', 302);
                done();
              });
          });
        });

        context('when referer is not present', () => {
          it('should respond with a script postMessage-ing the error', async () => {
            const response = await request
              .get(`${app.context.config.host}/v2/oauth/${provider}/link`)
              .query({ authToken })
              .redirects(0);
            const dom = propagateJsdomErrors(response.text);

            expect(
              dom.window.opener.postMessage,
              'to have calls satisfying',
              () => {
                dom.window.opener.postMessage({
                  authToken: undefined,
                  error:     expect.it('to be a', 'string'),
                }, '*');
              }
            );
          });
        });
      });
    }

    context('when provider is unknown', () => {
      it('should respond with 404 Not Found', (done) => {
        request
          .get(`${app.context.config.host}/v2/oauth/something/link`)
          .end((err, res) => {
            expect(res.status, 'to equal', 404);
            done();
          });
      });
    });
  });

  describe('#unlink()', () => {
    let user, authToken;
    beforeEach(async () => {
      user = await new User({ username: 'testuser', password: 'password', providers }).create();

      for (const provider of PROVIDERS) {
        // eslint-disable-next-line no-await-in-loop
        await user.addOrUpdateAuthMethod(provider, { id: 1, provider });
      }

      const response = await signInAsync({ username: 'testuser', password: 'password' });
      ({ authToken } = await response.json());
    });

    afterEach(async () => {
      await cleanDB($pg_database);
    });

    for (const provider of PROVIDERS) {
      context(provider, () => {
        context('when user is authenticated', () => {
          it(`should respond with auth methods without "${provider}"`, (done) => {
            request
              .post(`${app.context.config.host}/v2/oauth/${provider}/1/unlink`)
              .query({ authToken })
              .end((err, res) => {
                const profiles = Object.values(omit(providers, provider));

                for (const profile of profiles) {
                  expect(
                    res.body,
                    'to satisfy',
                    { authMethods: expect.it('to have an item satisfying', { profile }) }
                  );
                }

                done();
              });
          });
        });

        context('when user is not authenticated', () => {
          it('should respond with 401 Unauthorized', (done) => {
            request
              .post(`${app.context.config.host}/v2/oauth/${provider}/1/unlink`)
              .end((err, res) => {
                expect(res.status, 'to equal', 401);
                done();
              });
          });
        });
      })
    }

    context('when provider is unknown', () => {
      it('should respond with 404 Not Found', (done) => {
        request
          .post(`${app.context.config.host}/v2/oauth/something/1/unlink`)
          .query({ authToken })
          .end((err, res) => {
            expect(res.status, 'to equal', 404);
            done();
          });
      });
    });
  });

  describe('#userAuthMethods()', () => {
    let user, authToken;
    beforeEach(async () => {
      user = await new User({ username: 'testuser', password: 'password', providers }).create();

      const response = await signInAsync({ username: 'testuser', password: 'password' });
      ({ authToken } = await response.json());
    });

    afterEach(async () => {
      await cleanDB($pg_database);
    });

    context('when there are no auth methods linked', () => {
      it('should responds with an empty array', (done) => {
        request
          .get(`${app.context.config.host}/v2/oauth/methods`)
          .query({ authToken })
          .end((err, res) => {
            expect(res.body, 'to satisfy', { authMethods: [] });
            done();
          });
      });
    });

    context('when there are a few linked auth methods', () => {
      beforeEach(async () => {
        await user.addOrUpdateAuthMethod('facebook', { id: '1', provider: 'facebook' });
        await user.addOrUpdateAuthMethod('google', { id: '2', provider: 'google' });
      });

      it('should responds with an array of auth methods', (done) => {
        request
          .get(`${app.context.config.host}/v2/oauth/methods`)
          .query({ authToken })
          .end((err, res) => {
            expect(res.body, 'to satisfy', {
              authMethods: expect
                .it('to have an item satisfying', { providerId: '1', providerName: 'facebook' })
                .and('to have an item satisfying', { providerId: '2', providerName: 'google' })
            });
            done();
          });
      });
    });

    context('when user is not authenticated', () => {
      it('should respond with 401 Unauthorized', (done) => {
        request
          .get(`${app.context.config.host}/v2/oauth/methods`)
          .end((err, res) => {
            expect(res.status, 'to equal', 401);
            done();
          });
      });
    });
  });

  describe('#facebookFriends()', () => {
    context('when user is not authenticated', () => {
      it('should respond with 401 Unauthorized', (done) => {
        request
          .get(`${app.context.config.host}/v2/oauth/facebook/1234/friends`)
          .end((err, res) => {
            expect(res.status, 'to equal', 401);
            done();
          });
      });
    });
  });

  describe('#allFacebookFriends()', () => {
    let authToken;
    beforeEach(async () => {
      await new User({ username: 'testuser', password: 'password', providers }).create();

      const response = await signInAsync({ username: 'testuser', password: 'password' });
      ({ authToken } = await response.json());
    });

    afterEach(async () => {
      await cleanDB($pg_database);
    });

    context('when user has no facebook accounts linked', () => {
      it('should respond with empty object', (done) => {
        request
          .get(`${app.context.config.host}/v2/oauth/facebook/allFriends`)
          .query({ authToken })
          .end((err, res) => {
            expect(res.body, 'to satisfy', {});
            done();
          });
      });
    });

    context('when user is not authenticated', () => {
      it('should respond with 401 Unauthorized', (done) => {
        request
          .get(`${app.context.config.host}/v2/oauth/facebook/allFriends`)
          .end((err, res) => {
            expect(res.status, 'to equal', 401);
            done();
          });
      });
    });
  });
});
