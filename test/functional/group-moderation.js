/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../dbCleaner'
import { getSingleton } from '../../app/app';
import {
  createTestUsers,
  createGroupAsync,
  subscribeToAsync,
  createAndReturnPostToFeed,
  disableComments,
  enableComments,
  createCommentAsync,
  removeCommentAsync
} from './functional_test_helper';

describe('Group Moderation', () => {
  before(async () => {
    await getSingleton();
  });

  beforeEach(() => cleanDB($pg_database));

  describe('Mars creates group Celestials, Luna writes post to group, Venus is stranger', () => {
    let luna, mars, venus, post;
    beforeEach(async () => {
      [luna, mars, venus] = await createTestUsers(3);
      const { group: celestials } = await createGroupAsync(mars, 'celestials', 'Celestials');
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
        const response = await createCommentAsync(luna, post.id, 'My comment');
        ({ comments: { id: commentId } } = await response.json());
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
  });
});
