/* eslint-env node, mocha */
import expect from 'unexpected';

import { getSingleton } from '../../app/app';
import { PubSub } from '../../app/models';
import { PubSubAdapter, eventNames as ev } from '../../app/support/PubSubAdapter';
import redisDb from '../../app/setup/database';
import { connect as pgConnect } from '../../app/setup/postgres';
import cleanDB from '../dbCleaner';

import Session from './realtime-session';
import {
  createTestUsers,
  createAndReturnPost,
  updateUserAsync,
  createCommentAsync,
  performJSONRequest,
  authHeaders,
} from './functional_test_helper';

describe('Realtime of post comment events', () => {
  let port;

  before(async () => {
    const app = await getSingleton();
    port = process.env.PEPYATKA_SERVER_PORT || app.context.config.port;
    const pubsubAdapter = new PubSubAdapter(redisDb);
    PubSub.setPublisher(pubsubAdapter);
  });

  let luna, mars, lunaSession, marsSession;

  beforeEach(async () => {
    await cleanDB(pgConnect());

    [luna, mars] = await createTestUsers(['luna', 'mars']);

    [lunaSession, marsSession] = await Promise.all([
      Session.create(port, 'Luna session'),
      Session.create(port, 'Mars session'),
    ]);

    await Promise.all([
      lunaSession.sendAsync('auth', { authToken: luna.authToken }),
      marsSession.sendAsync('auth', { authToken: mars.authToken }),
    ]);
  });

  describe(`Mars wants to receive comments on commented post`, () => {
    beforeEach(async () => {
      await updateUserAsync(mars, { preferences: { notifyOfCommentsOnCommentedPosts: true } });
    });

    describe(`Luna creates post, Luna & Mars subscribes to it`, () => {
      let post;
      beforeEach(async () => {
        post = await createAndReturnPost(luna, 'Luna post');
        await Promise.all([
          lunaSession.sendAsync('subscribe', { post: [post.id] }),
          marsSession.sendAsync('subscribe', { post: [post.id] }),
        ]);
      });

      it(`should not deliver ${ev.POST_UPDATED} event to Luna after Luna's comment`, async () => {
        const test = lunaSession.notReceiveWhile(ev.POST_UPDATED, () =>
          createCommentAsync(luna, post.id, 'Hello'),
        );
        await expect(test, 'to be fulfilled');
      });

      it(`should not deliver ${ev.POST_UPDATED} event to Mars after Luna's comment`, async () => {
        const test = marsSession.notReceiveWhile(ev.POST_UPDATED, () =>
          createCommentAsync(luna, post.id, 'Hello'),
        );
        await expect(test, 'to be fulfilled');
      });

      it(`should not deliver ${ev.POST_UPDATED} event to Luna after Mars' comment`, async () => {
        const test = lunaSession.notReceiveWhile(ev.POST_UPDATED, () =>
          createCommentAsync(mars, post.id, 'Hello'),
        );
        await expect(test, 'to be fulfilled');
      });

      it(`should deliver ${ev.POST_UPDATED} event with 'notifyOfAllComments: true' to Mars after Mars' comment`, async () => {
        const test = marsSession.receiveWhile(ev.POST_UPDATED, () =>
          createCommentAsync(mars, post.id, 'Hello'),
        );
        await expect(test, 'to be fulfilled with', { posts: { notifyOfAllComments: true } });
      });

      it(`should deliver ${ev.POST_UPDATED} event with 'notifyOfAllComments: false' to Mars after Mars removes their comment`, async () => {
        let commentId;

        {
          const test = marsSession.receiveWhile(ev.POST_UPDATED, async () => {
            const resp = await createCommentAsync(mars, post.id, 'Hello').then((r) => r.json());
            commentId = resp.comments.id;
          });
          await expect(test, 'to be fulfilled with', { posts: { notifyOfAllComments: true } });
        }

        {
          const test = marsSession.receiveWhile(ev.POST_UPDATED, () =>
            performJSONRequest('DELETE', `/v2/comments/${commentId}`, null, authHeaders(mars)),
          );
          await expect(test, 'to be fulfilled with', { posts: { notifyOfAllComments: false } });
        }
      });

      it(`should deliver ${ev.POST_UPDATED} event with 'notifyOfAllComments: false' to Mars after Luna removes Mars' comment`, async () => {
        let commentId;

        {
          const test = marsSession.receiveWhile(ev.POST_UPDATED, async () => {
            const resp = await createCommentAsync(mars, post.id, 'Hello').then((r) => r.json());
            commentId = resp.comments.id;
          });
          await expect(test, 'to be fulfilled with', { posts: { notifyOfAllComments: true } });
        }

        {
          const test = marsSession.receiveWhile(ev.POST_UPDATED, () =>
            performJSONRequest('DELETE', `/v2/comments/${commentId}`, null, authHeaders(luna)),
          );
          await expect(test, 'to be fulfilled with', { posts: { notifyOfAllComments: false } });
        }
      });
    });
  });
});
