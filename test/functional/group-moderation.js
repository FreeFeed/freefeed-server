/* eslint-env node, mocha */
/* global $database, $pg_database */
import expect from 'unexpected';

import cleanDB from '../dbCleaner';
import { getSingleton } from '../../app/app';
import { EVENT_TYPES } from '../../app/support/EventTypes';
import { PubSubAdapter } from '../../app/support/PubSubAdapter';
import { dbAdapter, PubSub } from '../../app/models';

import {
  createTestUsers,
  createGroupAsync,
  subscribeToAsync,
  createAndReturnPostToFeed,
  disableComments,
  enableComments,
  createCommentAsync,
  removeCommentAsync,
  promoteToAdmin,
  createTestUser,
  getUserEvents,
  fetchPost,
  fetchTimeline,
  goPrivate,
  mutualSubscriptions,
  performJSONRequest,
  authHeaders,
  createMockAttachmentAsync,
  updatePostAsync,
} from './functional_test_helper';
import Session from './realtime-session';

const postModerationEvents = [
  EVENT_TYPES.POST_MODERATED,
  EVENT_TYPES.POST_MODERATED_BY_ANOTHER_ADMIN,
];
const commentModerationEvents = [
  EVENT_TYPES.COMMENT_MODERATED,
  EVENT_TYPES.COMMENT_MODERATED_BY_ANOTHER_ADMIN,
];

describe('Group Moderation', () => {
  let app;
  before(async () => {
    app = await getSingleton();
  });

  beforeEach(() => cleanDB($pg_database));

  describe('Mars creates group Celestials, Luna writes post to group, Venus is a stranger', () => {
    let luna, mars, venus, celestials, post;
    beforeEach(async () => {
      [luna, mars, venus] = await createTestUsers(['luna', 'mars', 'venus']);
      celestials = await createGroupAsync(mars, 'celestials', 'Celestials');
      await subscribeToAsync(luna, celestials);
      post = await createAndReturnPostToFeed([celestials], luna, 'My post');
    });

    describe('Disable comments', () => {
      it('should allow Luna to disable comments', async () => {
        const response = await disableComments(post.id, luna.authToken);
        expect(response.status, 'to be', 200);
      });

      it('should allow Mars to disable comments', async () => {
        const response = await disableComments(post.id, mars.authToken);
        expect(response.status, 'to be', 200);
      });

      it('should not allow Venus to disable comments', async () => {
        const response = await disableComments(post.id, venus.authToken);
        expect(response.status, 'to be', 403);
      });

      describe('when comments are disabled', () => {
        beforeEach(async () => {
          await disableComments(post.id, luna.authToken);
        });

        describe('enabling', () => {
          it('should allow Luna to enable comments', async () => {
            const response = await enableComments(post.id, luna.authToken);
            expect(response.status, 'to be', 200);
          });

          it('should allow Mars to enable comments', async () => {
            const response = await enableComments(post.id, mars.authToken);
            expect(response.status, 'to be', 200);
          });

          it('should not allow Venus to enable comments', async () => {
            const response = await enableComments(post.id, venus.authToken);
            expect(response.status, 'to be', 403);
          });
        });

        describe('commenting', () => {
          it('should allow Luna to comment post', async () => {
            const response = await createCommentAsync(luna, post.id, 'My comment');
            expect(response.status, 'to be', 200);
          });

          it('should allow Mars to comment post', async () => {
            const response = await createCommentAsync(mars, post.id, 'My comment');
            expect(response.status, 'to be', 200);
          });

          it('should not allow Venus to comment post', async () => {
            const response = await createCommentAsync(venus, post.id, 'My comment');
            expect(response.status, 'to be', 403);
          });
        });
      });
    });

    describe('Delete comments', () => {
      let commentId;
      beforeEach(async () => {
        commentId = await createCommentAndReturnId(luna, post.id);
      });

      it('should allow Luna to delete comment', async () => {
        const response = await removeCommentAsync(luna, commentId);
        expect(response.status, 'to be', 200);
      });

      it('should allow Mars to delete comment', async () => {
        const response = await removeCommentAsync(mars, commentId);
        expect(response.status, 'to be', 200);
      });

      it('should not allow Venus to delete comment', async () => {
        const response = await removeCommentAsync(venus, commentId);
        expect(response.status, 'to be', 403);
      });
    });

    describe('Delete comments: notifications', () => {
      describe('Mars and Jupiter are admins of Celestials and Gods, Luna wrote post to both groups, Mars and Luna comments post', () => {
        let jupiter, gods;
        let marsCommentId, lunaCommentId;

        beforeEach(async () => {
          jupiter = await createTestUser();
          gods = await createGroupAsync(mars, 'gods', 'Gods');
          await Promise.all([
            subscribeToAsync(luna, gods),
            promoteToAdmin({ username: 'celestials' }, mars, jupiter),
            promoteToAdmin({ username: 'gods' }, mars, jupiter),
          ]);
          post = await createAndReturnPostToFeed(
            [{ username: 'celestials' }, { username: 'gods' }],
            luna,
            'My post',
          );
          [marsCommentId, lunaCommentId] = await Promise.all([
            createCommentAndReturnId(mars, post.id),
            createCommentAndReturnId(luna, post.id),
          ]);
        });

        it('should not create notifications when Mars removes their comment', async () => {
          await removeCommentAsync(mars, marsCommentId);
          const marsEvents = await getFilteredEvents(mars, commentModerationEvents);
          const lunaEvents = await getFilteredEvents(luna, commentModerationEvents);
          const jupiterEvents = await getFilteredEvents(jupiter, commentModerationEvents);
          expect(marsEvents, 'to be empty');
          expect(lunaEvents, 'to be empty');
          expect(jupiterEvents, 'to be empty');
        });

        it('should create only Mars notification when Luna removes Mars comment', async () => {
          await removeCommentAsync(luna, marsCommentId);
          const marsEvents = await getFilteredEvents(mars, commentModerationEvents);
          const lunaEvents = await getFilteredEvents(luna, commentModerationEvents);
          const jupiterEvents = await getFilteredEvents(jupiter, commentModerationEvents);
          expect(marsEvents, 'to satisfy', [
            {
              event_type: EVENT_TYPES.COMMENT_MODERATED,
              // Luna is a post author, so we expect her here
              created_user_id: luna.user.id,
              post_id: post.id,
            },
          ]);
          expect(lunaEvents, 'to be empty');
          expect(jupiterEvents, 'to be empty');
        });

        it('should create only Mars notification when Jupiter removes Mars comment', async () => {
          await removeCommentAsync(jupiter, marsCommentId);
          const marsEvents = await getFilteredEvents(mars, commentModerationEvents);
          const lunaEvents = await getFilteredEvents(luna, commentModerationEvents);
          const jupiterEvents = await getFilteredEvents(jupiter, commentModerationEvents);
          expect(marsEvents, 'to satisfy', [
            {
              event_type: EVENT_TYPES.COMMENT_MODERATED,
              // Jupiter is not a post author, so we shouldn't see him here
              created_user_id: null,
              post_id: post.id,
              group_id: expect.it('to be one of', [gods.group.id, celestials.group.id]),
            },
          ]);
          expect(lunaEvents, 'to be empty');
          expect(jupiterEvents, 'to be empty');
        });

        it('should create Luna and Jupiter notification when Mars removes Luna comment', async () => {
          await removeCommentAsync(mars, lunaCommentId);
          const marsEvents = await getFilteredEvents(mars, commentModerationEvents);
          const lunaEvents = await getFilteredEvents(luna, commentModerationEvents);
          const jupiterEvents = await getFilteredEvents(jupiter, commentModerationEvents);
          expect(marsEvents, 'to be empty');
          expect(lunaEvents, 'to satisfy', [
            {
              event_type: EVENT_TYPES.COMMENT_MODERATED,
              created_user_id: null,
              post_id: post.id,
              group_id: expect.it('to be one of', [gods.group.id, celestials.group.id]),
            },
          ]);
          expect(jupiterEvents, 'to satisfy', [
            {
              event_type: EVENT_TYPES.COMMENT_MODERATED_BY_ANOTHER_ADMIN,
              created_user_id: mars.user.id,
              affected_user_id: luna.user.id,
              post_id: post.id,
              group_id: expect.it('to be one of', [gods.group.id, celestials.group.id]),
            },
          ]);
        });
      });
    });

    describe('Delete post from all or several feeds', () => {
      it('should allow Luna to delete their post', async () => {
        const response = await deletePostAsync(luna, post.id);
        expect(response.__httpCode, 'to be', 200);
        expect(response, 'to satisfy', { postStillAvailable: false });

        const postResponse = await fetchPost(post.id, null, { returnError: true });
        expect(postResponse.status, 'to be', 404);
      });

      it('should allow Mars to delete Luna post', async () => {
        const response = await deletePostAsync(mars, post.id);
        expect(response.__httpCode, 'to be', 200);
        expect(response, 'to satisfy', { postStillAvailable: false });

        const postResponse = await fetchPost(post.id, null, { returnError: true });
        expect(postResponse.status, 'to be', 404);
      });

      it('should not allow Venus to delete Luna post', async () => {
        const response = await deletePostAsync(venus, post.id);
        expect(response.__httpCode, 'to be', 403);
      });

      describe('Notifications (Jupiter is also admin of Celestials)', () => {
        let jupiter;
        beforeEach(async () => {
          jupiter = await createTestUser('jupiter');
          await promoteToAdmin({ username: 'celestials' }, mars, jupiter);
        });

        it('should not create notifications when Luna deletes their post', async () => {
          await deletePostAsync(luna, post.id);
          const lunaEvents = await getFilteredEvents(luna, postModerationEvents);
          const marsEvents = await getFilteredEvents(mars, postModerationEvents);
          const jupiterEvents = await getFilteredEvents(jupiter, postModerationEvents);
          expect(lunaEvents, 'to be empty');
          expect(marsEvents, 'to be empty');
          expect(jupiterEvents, 'to be empty');
        });

        it('should create Luna and Jupiter notifications when Mars deletes Luna post', async () => {
          await deletePostAsync(mars, post.id);
          const lunaEvents = await getFilteredEvents(luna, postModerationEvents);
          const marsEvents = await getFilteredEvents(mars, postModerationEvents);
          const jupiterEvents = await getFilteredEvents(jupiter, postModerationEvents);
          expect(lunaEvents, 'to satisfy', [
            {
              event_type: EVENT_TYPES.POST_MODERATED,
              created_user_id: null,
              group_id: celestials.group.id,
            },
          ]);
          expect(marsEvents, 'to be empty');
          expect(jupiterEvents, 'to satisfy', [
            {
              event_type: EVENT_TYPES.POST_MODERATED_BY_ANOTHER_ADMIN,
              created_user_id: mars.user.id,
              affected_user_id: luna.user.id,
              group_id: celestials.group.id,
            },
          ]);
        });
      });

      describe('Remove post from groups but not delete it', () => {
        describe('Luna wrote post to their feed, Celestial and Gods groups; Mars is admin of both groups, Jupiter is admin of Gods', () => {
          let jupiter, gods;

          beforeEach(async () => {
            jupiter = await createTestUser();
            gods = await createGroupAsync(mars, 'gods', 'Gods');
            await Promise.all([
              subscribeToAsync(luna, gods),
              promoteToAdmin({ username: 'gods' }, mars, jupiter),
            ]);
            await deletePostAsync(luna, post.id); // delete an old post
            post = await createAndReturnPostToFeed([luna, celestials, gods], luna, 'My post');
          });

          it('should allow Luna to delete their post', async () => {
            const response = await deletePostAsync(luna, post.id);
            expect(response.__httpCode, 'to be', 200);

            const postResponse = await fetchPost(post.id, null, { returnError: true });
            expect(postResponse.status, 'to be', 404);
          });

          it('should allow Luna to delete post only from their feed', async () => {
            const response = await deletePostAsync(luna, post.id, [luna.username]);
            expect(response, 'to satisfy', { __httpCode: 200, postStillAvailable: true });

            const postResponse = await fetchPost(post.id);
            expect(destFeedNames(postResponse), 'when sorted', 'to equal', ['celestials', 'gods']);
          });

          it('should allow Luna to delete post only from groups', async () => {
            const response = await deletePostAsync(luna, post.id, ['celestials', 'gods']);
            expect(response, 'to satisfy', { __httpCode: 200, postStillAvailable: true });

            const postResponse = await fetchPost(post.id);
            expect(destFeedNames(postResponse), 'when sorted', 'to equal', ['luna']);
          });

          it('should not allow Luna to delete post from unexisting feeds', async () => {
            const response = await deletePostAsync(luna, post.id, ['luna', 'gods', 'apples']);
            expect(response, 'to satisfy', { __httpCode: 403 });
          });

          it('should allow Mars to remove Luna post from Mars groups', async () => {
            const response = await deletePostAsync(mars, post.id);
            expect(response.__httpCode, 'to be', 200);
            expect(response, 'to satisfy', { postStillAvailable: true });
          });

          it("should not allow Jupiter to remove Luna post from non-Jupiter's groups", async () => {
            const response = await deletePostAsync(jupiter, post.id, ['celestials', 'gods']);
            expect(response.__httpCode, 'to be', 403);
          });

          describe('Mars removes Luna post from managed groups', () => {
            beforeEach(async () => {
              await deletePostAsync(mars, post.id);
            });

            it('should return post to viewer', async () => {
              const postResponse = await fetchPost(post.id, null, { returnError: true });
              expect(postResponse, 'to satisfy', { posts: { id: post.id } });
            });

            it('should return post in Luna feed', async () => {
              const postResponse = await fetchTimeline(luna.username);
              expect(postResponse.posts, 'to have an item satisfying', { id: post.id });
            });

            it('should not return post in Celestials feed', async () => {
              const postResponse = await fetchTimeline(celestials.username);
              expect(postResponse.posts, 'to be empty');
            });

            it('should not return post in Gods feed', async () => {
              const postResponse = await fetchTimeline(gods.username);
              expect(postResponse.posts, 'to be empty');
            });

            it('should create Luna and Jupiter notifications', async () => {
              const lunaEvents = await getFilteredEvents(luna, postModerationEvents);
              const marsEvents = await getFilteredEvents(mars, postModerationEvents);
              const jupiterEvents = await getFilteredEvents(jupiter, postModerationEvents);
              expect(lunaEvents, 'to satisfy', [
                {
                  event_type: EVENT_TYPES.POST_MODERATED,
                  created_user_id: null,
                  group_id: expect.it('to be one of', [gods.group.id, celestials.group.id]),
                  post_id: post.id,
                },
              ]);
              expect(marsEvents, 'to be empty');
              expect(jupiterEvents, 'to satisfy', [
                {
                  event_type: EVENT_TYPES.POST_MODERATED_BY_ANOTHER_ADMIN,
                  created_user_id: mars.user.id,
                  affected_user_id: luna.user.id,
                  group_id: gods.group.id,
                  post_id: post.id,
                },
              ]);
            });
          });

          describe('Luna becomes private, Mars is not a friend', () => {
            beforeEach(async () => {
              await goPrivate(luna);
            });

            it('should return { postStillAvailable: false } to Mars', async () => {
              const response = await deletePostAsync(mars, post.id);
              expect(response.__httpCode, 'to be', 200);
              expect(response, 'to satisfy', { postStillAvailable: false });
            });
          });

          describe('Jupiter removes Luna post from managed groups', () => {
            beforeEach(async () => {
              await deletePostAsync(jupiter, post.id);
            });

            it('should return post to viewer', async () => {
              const postResponse = await fetchPost(post.id, null, { returnError: true });
              expect(postResponse, 'to satisfy', { posts: { id: post.id } });
            });

            it('should return post in Luna feed', async () => {
              const postResponse = await fetchTimeline(luna.username);
              expect(postResponse.posts, 'to have an item satisfying', { id: post.id });
            });

            it('should return post in Celestials feed', async () => {
              const postResponse = await fetchTimeline(celestials.username);
              expect(postResponse.posts, 'to have an item satisfying', { id: post.id });
            });

            it('should not return post in Gods feed', async () => {
              const postResponse = await fetchTimeline(gods.username);
              expect(postResponse.posts, 'to be empty');
            });

            it('should create Luna and Mars notifications', async () => {
              const lunaEvents = await getFilteredEvents(luna, postModerationEvents);
              const marsEvents = await getFilteredEvents(mars, postModerationEvents);
              const jupiterEvents = await getFilteredEvents(jupiter, postModerationEvents);
              expect(lunaEvents, 'to satisfy', [
                {
                  event_type: EVENT_TYPES.POST_MODERATED,
                  created_user_id: null,
                  group_id: gods.group.id,
                  post_id: post.id,
                },
              ]);
              expect(marsEvents, 'to satisfy', [
                {
                  event_type: EVENT_TYPES.POST_MODERATED_BY_ANOTHER_ADMIN,
                  created_user_id: jupiter.user.id,
                  affected_user_id: luna.user.id,
                  group_id: gods.group.id,
                  post_id: post.id,
                },
              ]);
              expect(jupiterEvents, 'to be empty');
            });
          });

          describe('Realtime events', () => {
            let port;

            before(() => {
              port = process.env.PEPYATKA_SERVER_PORT || app.context.config.port;
              const pubsubAdapter = new PubSubAdapter($database);
              PubSub.setPublisher(pubsubAdapter);
            });

            let rtSession;
            beforeEach(async () => {
              rtSession = await Session.create(port, 'Anon session');
            });
            afterEach(() => rtSession.disconnect());

            describe('Viewer subscribes to Luna Posts channel', () => {
              beforeEach(async () => {
                const feed = await dbAdapter.getUserNamedFeed(luna.user.id, 'Posts');
                await rtSession.sendAsync('subscribe', { timeline: [feed.id] });
              });

              it(`should deliver 'post:update' event when Mars removes post`, async () => {
                const test = rtSession.receiveWhile('post:update', () =>
                  deletePostAsync(mars, post.id),
                );
                await expect(test, 'when fulfilled', 'to satisfy', { posts: { id: post.id } });
              });
            });

            describe('Viewer subscribes to Celestials Posts channel', () => {
              beforeEach(async () => {
                const feed = await dbAdapter.getUserNamedFeed(celestials.group.id, 'Posts');
                await rtSession.sendAsync('subscribe', { timeline: [feed.id] });
              });

              it(`should deliver 'post:update' event when Mars removes post`, async () => {
                const test = rtSession.receiveWhile('post:update', () =>
                  deletePostAsync(mars, post.id),
                );
                await expect(test, 'when fulfilled', 'to satisfy', { posts: { id: post.id } });
              });
            });

            describe('Viewer subscribes to Gods Posts channel', () => {
              beforeEach(async () => {
                const feed = await dbAdapter.getUserNamedFeed(gods.group.id, 'Posts');
                await rtSession.sendAsync('subscribe', { timeline: [feed.id] });
              });

              it(`should deliver 'post:update' event when Mars removes post`, async () => {
                const test = rtSession.receiveWhile('post:update', () =>
                  deletePostAsync(mars, post.id),
                );
                await expect(test, 'when fulfilled', 'to satisfy', { posts: { id: post.id } });
              });
            });

            describe('Luna becomes private, Mars is a friend', () => {
              let lunaSession, marsSession, jupiterSession;
              beforeEach(async () => {
                await mutualSubscriptions([luna, mars]);
                await goPrivate(luna);
                [lunaSession, marsSession, jupiterSession] = await Promise.all([
                  Session.create(port, 'Luna session'),
                  Session.create(port, 'Mars session'),
                  Session.create(port, 'Jupiter session'),
                ]);

                await Promise.all([
                  lunaSession.sendAsync('auth', { authToken: luna.authToken }),
                  marsSession.sendAsync('auth', { authToken: mars.authToken }),
                  jupiterSession.sendAsync('auth', { authToken: jupiter.authToken }),
                ]);
              });
              afterEach(() =>
                [lunaSession, marsSession, jupiterSession].forEach((s) => s.disconnect()),
              );

              describe('Viewers are subscribed to Gods Posts channel', () => {
                beforeEach(async () => {
                  const feed = await dbAdapter.getUserNamedFeed(gods.group.id, 'Posts');
                  await Promise.all([
                    rtSession.sendAsync('subscribe', { timeline: [feed.id] }),
                    lunaSession.sendAsync('subscribe', { timeline: [feed.id] }),
                    marsSession.sendAsync('subscribe', { timeline: [feed.id] }),
                    jupiterSession.sendAsync('subscribe', { timeline: [feed.id] }),
                  ]);
                });

                it(`should deliver 'post:destroy' event to anonymous when Mars removes post`, async () => {
                  const test = rtSession.receiveWhile('post:destroy', () =>
                    deletePostAsync(mars, post.id),
                  );
                  await expect(test, 'when fulfilled', 'to satisfy', { meta: { postId: post.id } });
                });

                it(`should deliver 'post:destroy' event to Jupiter when Mars removes post`, async () => {
                  const test = jupiterSession.receiveWhile('post:destroy', () =>
                    deletePostAsync(mars, post.id),
                  );
                  await expect(test, 'when fulfilled', 'to satisfy', { meta: { postId: post.id } });
                });

                it(`should deliver 'post:update' event to Luna when Mars removes post`, async () => {
                  const test = lunaSession.receiveWhile('post:update', () =>
                    deletePostAsync(mars, post.id),
                  );
                  await expect(test, 'when fulfilled', 'to satisfy', { posts: { id: post.id } });
                });

                it(`should deliver 'post:update' event to Mars when Mars removes post`, async () => {
                  const test = marsSession.receiveWhile('post:update', () =>
                    deletePostAsync(mars, post.id),
                  );
                  await expect(test, 'when fulfilled', 'to satisfy', { posts: { id: post.id } });
                });
              });
            });
          });
        });
      });

      describe('Moderate post without body and with attachment', () => {
        beforeEach(async () => {
          const att = await createMockAttachmentAsync(luna);
          luna.post = await createAndReturnPostToFeed([celestials, luna], luna, 'Body');
          await updatePostAsync(luna, {
            body: '',
            attachments: [att.id],
          });
        });

        it(`should allow Mars to remove Luna's post from group`, async () => {
          const response = await deletePostAsync(mars, luna.post.id);
          expect(response.__httpCode, 'to be', 200);
          expect(response, 'to satisfy', { postStillAvailable: true });
        });
      });
    });
  });
});

async function createCommentAndReturnId(userCtx, postId) {
  const response = await createCommentAsync(userCtx, postId, 'Just a comment');
  const {
    comments: { id: commentId },
  } = await response.json();
  return commentId;
}

async function getFilteredEvents(userCtx, eventTypes) {
  const resp = await getUserEvents(userCtx);
  return resp.Notifications.filter((n) => eventTypes.includes(n.event_type));
}

function deletePostAsync(userCtx, postId, fromFeeds = []) {
  const sp = new URLSearchParams();

  for (const group of fromFeeds) {
    sp.append('fromFeed', group);
  }

  return performJSONRequest(
    'DELETE',
    `/v1/posts/${postId}?${sp.toString()}`,
    null,
    authHeaders(userCtx),
  );
}

function destFeedNames(postData) {
  return postData.posts.postedTo.map((id) => {
    const userId = postData.subscriptions.find((s) => s.id === id).user;
    return postData.subscribers.find((s) => s.id === userId).username;
  });
}
