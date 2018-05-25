/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../dbCleaner'
import { getSingleton } from '../../app/app';
import { EVENT_TYPES } from '../../app/support/EventTypes';
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
  deletePostAsync,
  fetchPost
} from './functional_test_helper';

const postModerationEvents = [EVENT_TYPES.POST_MODERATED, EVENT_TYPES.POST_MODERATED_BY_ANOTHER_ADMIN];
const commentModerationEvents = [EVENT_TYPES.COMMENT_MODERATED, EVENT_TYPES.COMMENT_MODERATED_BY_ANOTHER_ADMIN];

describe('Group Moderation', () => {
  before(async () => {
    await getSingleton();
  });

  beforeEach(() => cleanDB($pg_database));

  describe('Mars creates group Celestials, Luna writes post to group, Venus is a stranger', () => {
    let luna, mars, venus, celestials, post;
    beforeEach(async () => {
      [luna, mars, venus] = await createTestUsers(3);
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
          post = await createAndReturnPostToFeed([{ username: 'celestials' }, { username: 'gods' }], luna, 'My post');
          [
            marsCommentId,
            lunaCommentId,
          ] = await Promise.all([
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
              event_type:      EVENT_TYPES.COMMENT_MODERATED,
              created_user_id: luna.user.id,
              post_id:         post.id,
            }
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
              event_type:      EVENT_TYPES.COMMENT_MODERATED,
              created_user_id: jupiter.user.id,
              post_id:         post.id,
              group_id:        expect.it('to be one of', [gods.group.id, celestials.group.id]),
            }
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
              event_type:      EVENT_TYPES.COMMENT_MODERATED,
              created_user_id: mars.user.id,
              post_id:         post.id,
              group_id:        expect.it('to be one of', [gods.group.id, celestials.group.id]),
            }
          ]);
          expect(jupiterEvents, 'to satisfy', [
            {
              event_type:       EVENT_TYPES.COMMENT_MODERATED_BY_ANOTHER_ADMIN,
              created_user_id:  mars.user.id,
              affected_user_id: luna.user.id,
              post_id:          post.id,
              group_id:         expect.it('to be one of', [gods.group.id, celestials.group.id]),
            }
          ]);
        });
      });
    });

    describe('Delete post completely from all its feeds', () => {
      it('should allow Luna to delete their post', async () => {
        const response = await deletePostAsync(luna, post.id);
        expect(response.status, 'to be', 200);

        const postResponse = await fetchPost(post.id, null, { returnError: true });
        expect(postResponse.status, 'to be', 404);
      });

      it('should allow Mars to delete Luna post', async () => {
        const response = await deletePostAsync(mars, post.id);
        expect(response.status, 'to be', 200);

        const postResponse = await fetchPost(post.id, null, { returnError: true });
        expect(postResponse.status, 'to be', 404);
      });

      it('should not allow Venus to delete Luna post', async () => {
        const response = await deletePostAsync(venus, post.id);
        expect(response.status, 'to be', 403);
      });

      describe('Notifications (Jupiter is also admin of Celestials)', () => {
        let jupiter;
        beforeEach(async () => {
          jupiter = await createTestUser();
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
              event_type:      EVENT_TYPES.POST_MODERATED,
              created_user_id: mars.user.id,
              group_id:        celestials.group.id,
            }
          ]);
          expect(marsEvents, 'to be empty');
          expect(jupiterEvents, 'to satisfy', [
            {
              event_type:       EVENT_TYPES.POST_MODERATED_BY_ANOTHER_ADMIN,
              created_user_id:  mars.user.id,
              affected_user_id: luna.user.id,
              group_id:         celestials.group.id,
            }
          ]);
        });
      });
    });
  });
});

async function createCommentAndReturnId(userCtx, postId) {
  const response = await createCommentAsync(userCtx, postId, 'Just a comment');
  const { comments: { id: commentId } } = await response.json();
  return commentId;
}

async function getFilteredEvents(userCtx, eventTypes) {
  const resp = await getUserEvents(userCtx);
  return resp.Notifications.filter((n) => eventTypes.includes(n.event_type));
}
