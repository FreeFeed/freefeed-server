/* eslint-env node, mocha */
/* global $pg_database */
import request from 'superagent';
import unexpected from 'unexpected';
import unexpectedSinon from 'unexpected-sinon';
import { omit } from 'lodash';

import cleanDB from '../dbCleaner';
import { getSingleton } from '../../app/app';
import { DummyPublisher } from '../../app/pubsub';
import { PubSub, dbAdapter, User } from '../../app/models';
import { propagateJsdomErrors } from '../utils/jsdom';
import { signInAsync } from '../functional/functional_test_helper';

const expect = unexpected.clone()
  .use(unexpectedSinon);

describe('OauthController', () => {
  const PROVIDERS = ['facebook', 'google', 'github'];
  const providers = PROVIDERS.reduce((acc, cur) => {
    acc[cur] = { id: 1 };
    return acc;
  }, {});

  let app;
  before(async () => {
    app = await getSingleton();
    PubSub.setPublisher(new DummyPublisher());
  });

  describe(`#authenticate()`, () => {
    for (const provider of PROVIDERS) {
      context(`when provider is "${provider}"`, () => {
        context('when referer is present', () => {
          it('should redirect', (done) => {
            request
              .get(`${app.context.config.host}/v2/oauth/${provider}`)
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
              .get(`${app.context.config.host}/v2/oauth/${provider}`)
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
          .get(`${app.context.config.host}/v2/oauth/something`)
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
      context(`when provider is "${provider}"`, () => {
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
      await new User({ username: 'testuser', password: 'password', providers }).create();
      const response = await signInAsync({ username: 'testuser', password: 'password' });
      ({ authToken } = await response.json());
    });

    afterEach(async () => {
      await cleanDB($pg_database);
    });

    for (const provider of ['facebook']) {
      context(`when provider is "${provider}"`, () => {
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
    for (const provider of ['facebook']) {
      context(`when provider is "${provider}"`, () => {
        it('should respond with a script postMessage-ing an error from provider', (done) => {
          request
            .get(`${app.context.config.host}/v2/oauth/${provider}/authz/callback`)
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
    }

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
      context(`when provider is "${provider}"`, () => {
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
      const response = await signInAsync({ username: 'testuser', password: 'password' });
      ({ authToken } = await response.json());
    });

    afterEach(async () => {
      await cleanDB($pg_database);
    });

    for (const provider of PROVIDERS) {
      context(`when provider is "${provider}"`, () => {
        context('when user is authenticated', () => {
          it(`should remove "${provider}" property from users.providers`, async () => {
            await request
              .post(`${app.context.config.host}/v2/oauth/${provider}/unlink`)
              .query({ authToken });
            const updatedUser = await dbAdapter.getUserById(user.id);
            expect(updatedUser.providers, 'to exhaustively satisfy', omit(providers, provider));
          });
        });

        context('when user is not authenticated', () => {
          it('should respond with 401 Unauthorized', (done) => {
            request
              .post(`${app.context.config.host}/v2/oauth/${provider}/unlink`)
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
          .post(`${app.context.config.host}/v2/oauth/something/unlink`)
          .query({ authToken })
          .end((err, res) => {
            expect(res.status, 'to equal', 404);
            done();
          });
      });
    });
  });
});
