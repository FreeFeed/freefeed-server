/* eslint-env node, mocha */
/* global $pg_database */
import { noop } from 'lodash';
import expect from 'unexpected';

import { commentAccessRequired } from '../../../app/controllers/middlewares';
import cleanDB from '../../dbCleaner';
import { User, Post, Group, Comment } from '../../../app/models';
import { ForbiddenException } from '../../../app/support/exceptions';

describe('commentAccessRequired', () => {
  beforeEach(() => cleanDB($pg_database));

  const handler = (ctx, mustBeVisible = true) =>
    commentAccessRequired({ mustBeVisible })(ctx, noop);

  describe('Luna created post in Selenites group, Mars wrote comment', () => {
    let /** @type {User} */
      luna,
      /** @type {User} */
      mars,
      /** @type {User} */
      venus,
      /** @type {Group} */
      selenites;
    let /** @type {Post} */ post, /** @type {Comment} */ comment;
    let ctx;

    beforeEach(async () => {
      luna = new User({ username: 'Luna', password: 'password' });
      mars = new User({ username: 'Mars', password: 'password' });
      venus = new User({ username: 'Venus', password: 'password' });
      await Promise.all([luna.create(), mars.create(), venus.create()]);
      selenites = new Group({ username: 'selenites' });
      await selenites.create(luna.id);

      post = new Post({
        body: 'Post body',
        userId: luna.id,
        timelineIds: [await selenites.getPostsTimelineId()],
      });
      await post.create();

      comment = new Comment({
        body: 'Comment body',
        userId: mars.id,
        postId: post.id,
      });
      await comment.create();

      ctx = {
        params: { commentId: comment.id },
        state: { user: null },
      };
    });

    it(`should show comment to anonymous`, async () => {
      await expect(handler(ctx), 'to be fulfilled');
      expect(ctx.state, 'to satisfy', {
        post: {
          id: post.id,
        },
        comment: {
          id: comment.id,
          body: comment.body,
        },
      });
    });

    it(`should show comment to Venus`, async () => {
      ctx.state.user = venus;
      await expect(handler(ctx), 'to be fulfilled');
    });

    // commentAccessRequired includes postAccessRequired, so we will check only
    // 'extra' ban logic here
    describe('Venus banned Mars', () => {
      beforeEach(() => venus.ban(mars.username));

      it(`should not show comment to Venus`, async () => {
        ctx.state.user = venus;
        await expect(
          handler(ctx),
          'to be rejected with',
          new ForbiddenException('You have banned the author of this comment'),
        );
      });

      it(`should show comment with placeholder to Venus`, async () => {
        ctx.state.user = venus;
        await expect(handler(ctx, false), 'to be fulfilled');
        expect(ctx.state, 'to satisfy', {
          comment: {
            id: comment.id,
            body: 'Hidden comment',
            hideType: Comment.HIDDEN_BANNED,
          },
        });
      });

      describe('Venus turns off bans in Selenites', () => {
        beforeEach(() => selenites.disableBansFor(venus.id));

        it(`should show comment to Venus`, async () => {
          ctx.state.user = venus;
          await expect(handler(ctx), 'to be fulfilled');
        });
      });
    });
  });
});
