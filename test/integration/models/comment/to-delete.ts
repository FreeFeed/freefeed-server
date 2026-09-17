import { describe, beforeEach, it } from 'mocha';
import unexpected from 'unexpected';
import unexpectedDate from 'unexpected-date';
import type { ParameterizedContext } from 'koa';

import cleanDB from '../../../dbCleaner';
import { Comment, dbAdapter, Group, Post, User } from '../../../../app/models';
import { createUser } from '../../helpers/users';
import { createComment, createPost } from '../../helpers/posts-and-comments';
import { commentAccessRequired } from '../../../../app/controllers/middlewares';
import { DELETE_COMMENT } from '../../../../app/jobs/delete-comment';
import { UndoCommentDelete } from '../../../../app/support/undo/comment-delete';
import { initJobProcessing } from '../../../../app/jobs';
import { EVENT_TYPES } from '../../../../app/support/EventTypes';

const expect = unexpected.clone();
expect.use(unexpectedDate);

describe('Comments in to-delete state', () => {
  beforeEach(() => cleanDB(dbAdapter.database));

  let luna: User;
  let post: Post;
  beforeEach(async () => {
    luna = await createUser('luna');
    post = await createPost(luna, 'Post body');
  });

  describe('Luna writes a comment and inactivates it', () => {
    let comment: Comment;

    beforeEach(async () => {
      comment = await createComment(luna, post, 'Comment body');
      await comment.inactivate();
    });

    it(`should be in 'toDelete' state`, () => {
      expect(comment.toDelete, 'to equal', true);
    });

    it(`should not be visible in 'commentAccessRequired' middleware`, async () => {
      const mw = commentAccessRequired({ mustBeVisible: false });
      const ctx = {
        state: { user: luna },
        params: { commentId: comment.id },
      } as unknown as ParameterizedContext;

      await expect(
        mw(ctx, () => Promise.resolve(null)),
        'to be rejected with',
        { status: 404 },
      );
    });

    it(`should not appear in Luna's Comments timeline`, async () => {
      const timeline = await luna.getCommentsTimelineIntId();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const p1 = (await dbAdapter.getPostById(post.id))!; // Re-read post
      expect(p1.feedIntIds, 'not to contain', timeline);
    });

    it(`should not appear in search results`, async () => {
      expect(await dbAdapter.search('Comment', { viewerId: luna.id }), 'to be empty');
    });

    describe('Job processing', () => {
      it(`should be scheduled to be deleted`, async () => {
        const jobs = await dbAdapter.getAllJobs([DELETE_COMMENT]);
        expect(jobs, 'to satisfy', [
          {
            name: DELETE_COMMENT,
            payload: { commentId: comment.id },
          },
        ]);
        expect(
          jobs[0].unlockAt,
          'to be close to',
          new Date(jobs[0].createdAt.getTime() + UndoCommentDelete.ttlSec * 1000),
        );
      });

      it(`should actually be deleted after job processing`, async () => {
        const [job] = await dbAdapter.getAllJobs([DELETE_COMMENT]);
        job.setUnlockAt(0); // Unlock now

        const jm = await initJobProcessing();
        await jm.fetchAndProcess(1);
        expect(await dbAdapter.getCommentById(comment.id), 'to be null');
      });

      it(`should not delete restored comment`, async () => {
        const [job] = await dbAdapter.getAllJobs([DELETE_COMMENT]);
        job.setUnlockAt(0); // Unlock now

        await comment.activate(luna);

        const jm = await initJobProcessing();
        await jm.fetchAndProcess(1);
        expect(await dbAdapter.getCommentById(comment.id), 'not to be null');
      });
    });
  });

  describe('Luna writes a post in group and group admin inactivates and then activates comment to it', () => {
    let admin1: User;
    let admin2: User;
    let group: Group;
    let comment: Comment;
    beforeEach(async () => {
      admin1 = await createUser('admin1');
      admin2 = await createUser('admin2');
      group = new Group({ username: 'group' });
      await group.create(admin1.id);
      await group.addAdministrator(admin2.id);

      post = await createPost(luna, 'Post body', [group]);
      comment = await createComment(luna, post, 'Comment body');
      await comment.inactivate(admin1);
      await comment.activate(admin1);
    });

    it(`should not be in 'toDelete' state`, () => {
      expect(comment.toDelete, 'to equal', false);
    });

    it(`should notify Luna about comment moderation and restore`, async () => {
      const events = await dbAdapter.getUserEvents(luna.intId);
      expect(events, 'to satisfy', [
        {
          event_type: EVENT_TYPES.COMMENT_RESTORED,
          created_by_user_id: admin1.intId,
          target_user_id: luna.intId,
          post_id: post.intId,
          comment_id: comment.intId,
        },
        {
          event_type: EVENT_TYPES.COMMENT_MODERATED,
          created_by_user_id: admin1.intId,
          target_user_id: luna.intId,
          post_id: post.intId,
          comment_id: null, // Comment is kind of "deleted" here
        },
      ]);
    });

    it(`should notify Admin2 about comment moderation and restore`, async () => {
      const events = await dbAdapter.getUserEvents(admin2.intId);
      expect(events, 'to satisfy', [
        {
          event_type: EVENT_TYPES.COMMENT_RESTORED_BY_ANOTHER_ADMIN,
          created_by_user_id: admin1.intId,
          target_user_id: luna.intId,
          post_id: post.intId,
          comment_id: comment.intId,
        },
        {
          event_type: EVENT_TYPES.COMMENT_MODERATED_BY_ANOTHER_ADMIN,
          created_by_user_id: admin1.intId,
          target_user_id: luna.intId,
          post_id: post.intId,
          comment_id: null, // Comment is kind of "deleted" here
        },
      ]);
    });

    it(`should not notify Admin1 himself about comment moderation and restore`, async () => {
      const events = await dbAdapter.getUserEvents(admin1.intId);
      expect(events, 'to satisfy', []);
    });
  });
});
