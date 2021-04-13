/* eslint-env node, mocha */
/* global $pg_database */

import unexpected from 'unexpected';

import cleanDB from '../dbCleaner';
import { getSingleton } from '../../app/app';
import { DummyPublisher } from '../../app/pubsub';
import { PubSub } from '../../app/models';

import {
  banUser,
  createGroupAsync,
  createUserAsync,
  createUserAsyncPost,
  updateUserAsync,
  whoami,
  createInvitation,
  getInvitation,
  getUserEvents,
} from './functional_test_helper';
import * as schema from './schemaV2-helper';

const expect = unexpected.clone().use(schema.freefeedAssertions);

describe('Invitations', () => {
  before(async () => {
    await getSingleton();
    PubSub.setPublisher(new DummyPublisher());
  });

  beforeEach(() => cleanDB($pg_database));

  describe('InvitationsController', () => {
    describe('#createInvitation', () => {
      it('should reject unauthenticated users', async () => {
        const res = await createInvitation();
        expect(res, 'to be an API error', 403, 'Unauthorized');
      });

      describe('for authenticated users', () => {
        let luna, mars;

        beforeEach(async () => {
          [luna, mars] = await Promise.all([
            createUserAsync('luna', 'pw'),
            createUserAsync('mars', 'pw'),
            createUserAsync('jupiter', 'pw'),
          ]);
        });

        describe('valid payload', () => {
          it('should create invitation', async () => {
            const invitation = {
              message: 'Welcome to Freefeed!',
              lang: 'en',
              singleUse: false,
              users: ['luna', 'mars', 'jupiter'],
              groups: [],
            };
            const res = await createInvitation(luna, invitation);
            await expect(res, 'to be an invitation response');
          });

          it('reg counter should be zero', async () => {
            const invitation = {
              message: 'Welcome to Freefeed!',
              lang: 'en',
              singleUse: false,
              users: ['luna', 'mars', 'jupiter'],
              groups: [],
            };
            const res = await createInvitation(luna, invitation);
            const resJson = await res.json();
            expect(resJson, 'to satisfy', { invitation: { registrations_count: 0 } });
          });
        });

        describe('invalid payload', () => {
          describe('missing or empty message', () => {
            it('should not create invitation', async () => {
              const invitation = {
                lang: 'en',
                singleUse: false,
                users: ['luna', 'mars', 'jupiter'],
                groups: [],
              };
              let res = await createInvitation(luna, invitation);
              expect(res, 'to be an API error', 422, 'Invitation message must not be empty');

              invitation.message = null;
              res = await createInvitation(luna, invitation);
              expect(res, 'to be an API error', 422, 'Invitation message must not be empty');

              invitation.message = '';
              res = await createInvitation(luna, invitation);
              expect(res, 'to be an API error', 422, 'Invitation message must not be empty');
            });
          });

          describe('missing or empty lang', () => {
            it('should not create invitation', async () => {
              const invitation = {
                message: 'Welcome to Freefeed!',
                singleUse: false,
                users: ['luna', 'mars', 'jupiter'],
                groups: [],
              };
              let res = await createInvitation(luna, invitation);
              expect(res, 'to be an API error', 422, 'Invitation lang must not be empty');

              invitation.lang = null;
              res = await createInvitation(luna, invitation);
              expect(res, 'to be an API error', 422, 'Invitation lang must not be empty');

              invitation.lang = '';
              res = await createInvitation(luna, invitation);
              expect(res, 'to be an API error', 422, 'Invitation lang must not be empty');
            });
          });

          describe('missing or empty singleUse', () => {
            it('should not create invitation', async () => {
              const invitation = {
                message: 'Welcome to Freefeed!',
                lang: 'en',
                users: ['luna', 'mars', 'jupiter'],
                groups: [],
              };
              let res = await createInvitation(luna, invitation);
              expect(res, 'to be an API error', 422, 'Invitation singleUse must not be empty');

              invitation.singleUse = null;
              res = await createInvitation(luna, invitation);
              expect(res, 'to be an API error', 422, 'Invitation singleUse must not be empty');

              invitation.singleUse = '';
              res = await createInvitation(luna, invitation);
              expect(res, 'to be an API error', 422, 'Invitation singleUse must not be empty');
            });
          });

          describe('non-existent user', () => {
            it('should not create invitation', async () => {
              const invitation = {
                message: 'Welcome to Freefeed!',
                lang: 'en',
                singleUse: true,
                users: ['luna', 'mars', 'jupi_ter'],
                groups: [],
              };
              const res = await createInvitation(luna, invitation);
              expect(res, 'to be an API error', 422, 'Users not found: jupi_ter');
            });
          });

          describe('non-existent group', () => {
            it('should not create invitation', async () => {
              const invitation = {
                message: 'Welcome to Freefeed!',
                lang: 'en',
                singleUse: true,
                users: ['luna', 'mars', 'jupiter'],
                groups: ['abyrvalg'],
              };
              const res = await createInvitation(luna, invitation);
              expect(res, 'to be an API error', 422, 'Groups not found: abyrvalg');
            });
          });
        });

        describe('with recommendation to banned user', () => {
          it('should create invitation', async () => {
            await banUser(luna, mars);
            const invitation = {
              message: 'Welcome to Freefeed!',
              lang: 'en',
              singleUse: false,
              users: ['luna', 'mars', 'jupiter'],
              groups: [],
            };
            const res = await createInvitation(luna, invitation);
            expect(res, 'to be an invitation response');
          });
        });

        describe('with recommendation to user who banned me', () => {
          it('should create invitation', async () => {
            await banUser(mars, luna);
            const invitation = {
              message: 'Welcome to Freefeed!',
              lang: 'en',
              singleUse: false,
              users: ['luna', 'mars', 'jupiter'],
              groups: [],
            };
            const res = await createInvitation(luna, invitation);
            expect(res, 'to be an invitation response');
          });
        });
      });
    });

    describe('#getInvitation', () => {
      describe('for non-existent invitation', () => {
        it('should return 404', async () => {
          const res = await getInvitation('918abb80-f0bd-490d-989a-2486032648dd', null);
          expect(
            res,
            'to be an API error',
            404,
            "Can't find invitation '918abb80-f0bd-490d-989a-2486032648dd'",
          );
        });
      });

      describe('when no secureId provided', () => {
        describe('secureId is not UUID', () => {
          it('should return 404', async () => {
            let res = await getInvitation(null, null);
            expect(res, 'to be an API error', 404, "Can't find invitation 'null'");

            res = await getInvitation(42, null);
            expect(res, 'to be an API error', 404, "Can't find invitation '42'");

            res = await getInvitation('test', null);
            expect(res, 'to be an API error', 404, "Can't find invitation 'test'");
          });
        });

        describe('secureId is UUID', () => {
          it('should return 404', async () => {
            const res = await getInvitation('918abb80-f0bd-490d-989a-2486032648dd', null);
            expect(
              res,
              'to be an API error',
              404,
              "Can't find invitation '918abb80-f0bd-490d-989a-2486032648dd'",
            );
          });
        });
      });

      describe('for already used singleUse invitation', () => {
        let luna, singleUseInvitationSecureId;

        beforeEach(async () => {
          [luna] = await Promise.all([
            createUserAsync('luna', 'pw'),
            createUserAsync('mars', 'pw'),
            createUserAsync('jupiter', 'pw'),
          ]);

          const invitation = {
            message: 'Welcome to Freefeed!',
            lang: 'en',
            singleUse: true,
            users: ['luna', 'mars'],
            groups: [],
          };
          const newInvitationRes = await createInvitation(luna, invitation);
          const newInvitationResJson = await newInvitationRes.json();
          singleUseInvitationSecureId = newInvitationResJson.invitation.secure_id;
        });

        it('should return invitation', async () => {
          const invitationRes = await getInvitation(singleUseInvitationSecureId, null);
          expect(invitationRes, 'to be an invitation response');
        });
      });

      describe('for existing invitation', () => {
        let luna, mars, jupiter;

        beforeEach(async () => {
          [luna, mars, jupiter] = await Promise.all([
            createUserAsync('luna', 'pw'),
            createUserAsync('mars', 'pw'),
            createUserAsync('jupiter', 'pw'),
          ]);
        });

        describe('for unauthenticated user', () => {
          it('should return invitation', async () => {
            const invitation = {
              message: 'Welcome to Freefeed!',
              lang: 'en',
              singleUse: false,
              users: ['luna', 'mars', 'jupiter'],
              groups: [],
            };
            const res = await createInvitation(luna, invitation);
            const responseJson = await res.json();
            const invitationSecureId = responseJson.invitation.secure_id;
            const invitationRes = await getInvitation(invitationSecureId, null);
            expect(invitationRes, 'to be an invitation response');
          });
        });

        describe('for authenticated user', () => {
          it('should return invitation', async () => {
            const invitation = {
              message: 'Welcome to Freefeed!',
              lang: 'en',
              singleUse: false,
              users: ['luna', 'mars'],
              groups: [],
            };
            const res = await createInvitation(luna, invitation);
            const responseJson = await res.json();
            const invitationSecureId = responseJson.invitation.secure_id;
            let invitationRes = await getInvitation(invitationSecureId, luna);
            expect(invitationRes, 'to be an invitation response');

            invitationRes = await getInvitation(invitationSecureId, mars);
            expect(invitationRes, 'to be an invitation response');

            invitationRes = await getInvitation(invitationSecureId, jupiter);
            expect(invitationRes, 'to be an invitation response');
          });
        });
      });
    });
  });

  describe('UsersControllerV1', () => {
    describe('#create', () => {
      describe('when only invitationId provided', () => {
        let luna, mars, invitationSecureId;

        beforeEach(async () => {
          [luna, mars] = await Promise.all([
            createUserAsync('luna', 'pw'),
            createUserAsync('mars', 'pw'),
            createUserAsync('jupiter', 'pw'),
          ]);

          await Promise.all([
            createGroupAsync(mars, 'solarsystem', 'Solar System', false, false),
            createGroupAsync(luna, 'celestials', 'Celestials', true, false),
          ]);

          await updateUserAsync(mars, { isProtected: '0', isPrivate: '1' });

          const invitation = {
            message: 'Welcome to Freefeed!',
            lang: 'en',
            singleUse: false,
            users: ['luna', 'mars'],
            groups: ['solarsystem', 'celestials'],
          };
          const res = await createInvitation(luna, invitation);
          const responseJson = await res.json();
          invitationSecureId = responseJson.invitation.secure_id;
        });

        describe('valid invitation', () => {
          describe('should register user and', () => {
            let pluto;

            beforeEach(async () => {
              const user = {
                username: 'pluto',
                password: 'pw',
                invitation: invitationSecureId,
              };

              const response = await createUserAsyncPost(user);
              expect(response.status, 'to be', 200);
              const data = await response.json();

              const userData = data.users;
              userData.password = user.password;

              pluto = {
                authToken: data.authToken,
                user: userData,
                username: user.username.toLowerCase(),
                password: user.password,
              };
            });

            it('subscribe him to recommended users/groups', async () => {
              const res = await whoami(pluto.authToken);
              const whoAmIResponseJson = await res.json();
              expect(whoAmIResponseJson, 'to satisfy', {
                subscribers: expect
                  .it('to be an', 'array')
                  .and('to have an item satisfying', { username: 'luna' })
                  .and('to have an item satisfying', { username: 'solarsystem' }),
              });
            });

            it('create subscription requests to recommended private users/groups', async () => {
              const res = await whoami(pluto.authToken);
              const whoAmIResponseJson = await res.json();
              expect(whoAmIResponseJson, 'to satisfy', {
                requests: expect
                  .it('to be an', 'array')
                  .and('to have an item satisfying', { username: 'mars' })
                  .and('to have an item satisfying', { username: 'celestials' }),
              });
            });

            it('increment registrations counter', async () => {
              const invitationRes = await getInvitation(invitationSecureId, luna);
              const invitationJson = await invitationRes.json();
              expect(invitationJson, 'to satisfy', { invitation: { registrations_count: 1 } });
            });

            it('create event for invitation creator', async () => {
              const events = await getUserEvents(luna);
              expect(events, 'to have key', 'Notifications');
              expect(events.Notifications, 'to be an', 'array');
              expect(events.Notifications, 'to have an item satisfying', {
                event_type: 'invitation_used',
              });
            });
          });
        });

        describe('invalid invitation', () => {
          let singleUseInvitationSecureId;
          beforeEach(async () => {
            const invitation = {
              message: 'Welcome to Freefeed!',
              lang: 'en',
              singleUse: true,
              users: ['luna', 'mars'],
              groups: ['solarsystem', 'celestials'],
            };
            const newInvitationRes = await createInvitation(luna, invitation);
            const newInvitationResJson = await newInvitationRes.json();
            singleUseInvitationSecureId = newInvitationResJson.invitation.secure_id;
          });

          describe('non-existent invitation', () => {
            it('should return 404', async () => {
              const user1 = {
                username: 'pluto',
                password: 'pw',
                invitation: '918abb80-f0bd-490d-989a-2486032648dd',
              };

              const response1 = await createUserAsyncPost(user1);
              expect(response1.status, 'to be', 404);
            });
          });

          describe('already used invitation', () => {
            it('should not register user and return validation error', async () => {
              const user1 = {
                username: 'pluto',
                password: 'pw',
                invitation: singleUseInvitationSecureId,
              };

              const response1 = await createUserAsyncPost(user1);
              expect(response1.status, 'to be', 200);

              const user2 = {
                username: 'pluto1',
                password: 'pw',
                invitation: singleUseInvitationSecureId,
              };

              const response2 = await createUserAsyncPost(user2);
              expect(response2.status, 'to be', 422);
              const errJson = await response2.json();
              expect(errJson, 'to satisfy', {
                err: `Somebody has already used invitation "${singleUseInvitationSecureId}"`,
              });
            });
          });
        });
      });

      describe('when invitationId and cancel_subscription provided', () => {
        let luna, mars, invitationSecureId;

        beforeEach(async () => {
          [luna, mars] = await Promise.all([
            createUserAsync('luna', 'pw'),
            createUserAsync('mars', 'pw'),
            createUserAsync('jupiter', 'pw'),
          ]);

          await Promise.all([
            createGroupAsync(mars, 'solarsystem', 'Solar System', false, false),
            createGroupAsync(luna, 'celestials', 'Celestials', true, false),
          ]);

          await updateUserAsync(mars, { isProtected: '0', isPrivate: '1' });

          const invitation = {
            message: 'Welcome to Freefeed!',
            lang: 'en',
            singleUse: false,
            users: ['luna', 'mars'],
            groups: ['solarsystem', 'celestials'],
          };
          const res = await createInvitation(luna, invitation);
          const responseJson = await res.json();
          invitationSecureId = responseJson.invitation.secure_id;
        });

        describe('cancel_subscription: true', () => {
          describe('should register user and', () => {
            let pluto;

            beforeEach(async () => {
              const user = {
                username: 'pluto',
                password: 'pw',
                invitation: invitationSecureId,
                cancel_subscription: true,
              };

              const response = await createUserAsyncPost(user);
              expect(response.status, 'to be', 200);
              const data = await response.json();

              const userData = data.users;
              userData.password = user.password;

              pluto = {
                authToken: data.authToken,
                user: userData,
                username: user.username.toLowerCase(),
                password: user.password,
              };
            });

            it('should not subscribe him to recommended users/groups', async () => {
              const res = await whoami(pluto.authToken);
              const whoAmIResponseJson = await res.json();
              expect(whoAmIResponseJson, 'to satisfy', {
                subscribers: expect.it('to be an', 'array').and('to be empty'),
              });
            });

            it('should not create subscription requests to recommended private users/groups', async () => {
              const res = await whoami(pluto.authToken);
              const whoAmIResponseJson = await res.json();
              expect(whoAmIResponseJson, 'to satisfy', {
                requests: expect.it('to be an', 'array').and('to be empty'),
              });
            });

            it('increment registrations counter', async () => {
              const invitationRes = await getInvitation(invitationSecureId, luna);
              const invitationJson = await invitationRes.json();
              expect(invitationJson, 'to satisfy', { invitation: { registrations_count: 1 } });
            });

            it('create event for invitation creator', async () => {
              const events = await getUserEvents(luna);
              expect(events, 'to have key', 'Notifications');
              expect(events.Notifications, 'to be an', 'array');
              expect(events.Notifications, 'to have an item satisfying', {
                event_type: 'invitation_used',
              });
            });
          });
        });
      });
    });
  });
});
