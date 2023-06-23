/* eslint-env node, mocha */
/* global $pg_database */

import { noop } from 'lodash';
import expect from 'unexpected';

import { postAccessRequired } from '../../../app/controllers/middlewares';
import cleanDB from '../../dbCleaner';
import { User, Post } from '../../../app/models';

describe('postAccessRequired', () => {
  beforeEach(() => cleanDB($pg_database));

  const handler = (ctx, map) => postAccessRequired(map)(ctx, noop);

  describe("Luna, Mars and Luna's post", () => {
    let luna, mars, post, ctx;
    beforeEach(async () => {
      luna = new User({ username: 'Luna', password: 'password' });
      mars = new User({ username: 'Mars', password: 'password' });
      await Promise.all([luna.create(), mars.create()]);
      post = new Post({
        body: 'Post body',
        userId: luna.id,
        timelineIds: [await luna.getPostsTimelineId()],
        commentsDisabled: '0',
      });
      await post.create();

      ctx = {
        params: { postId: post.id },
        state: {},
      };
    });

    it('should not allow to process route without required parameter', async () => {
      Reflect.deleteProperty(ctx.params, 'postId');
      await expect(handler(ctx), 'to be rejected with', { status: 500 });
    });

    it('should not allow to view inexistent post', async () => {
      ctx.params.postId = '00000000-0000-0000-C000-000000000046';
      await expect(handler(ctx), 'to be rejected with', { status: 404 });
    });

    it('should allow to view post with custom route parameter', async () => {
      ctx.params.postId2 = ctx.params.postId;
      Reflect.deleteProperty(ctx.params, 'postId');
      await expect(handler(ctx, { postId2: 'post2' }), 'to be fulfilled');
      expect(ctx.state, 'to satisfy', { post2: { id: post.id } });
    });

    it('should allow to view two posts', async () => {
      ctx.params.postId2 = ctx.params.postId;
      await expect(handler(ctx, { postId: 'post', postId2: 'post2' }), 'to be fulfilled');
      expect(ctx.state, 'to satisfy', { post2: { id: post.id }, post: { id: post.id } });
    });

    it('should not allow to view two posts if one of them is not exists', async () => {
      ctx.params.postId2 = ctx.params.postId;
      ctx.params.postId = '00000000-0000-0000-C000-000000000046';
      await expect(handler(ctx, { postId: 'post', postId2: 'post2' }), 'to be rejected with', {
        status: 404,
      });
    });

    it('should allow anonymous to view post', async () => {
      await expect(handler(ctx), 'to be fulfilled');
      expect(ctx.state, 'to satisfy', { post: { id: post.id } });
    });

    it('should allow Mars to view post', async () => {
      ctx.state.user = mars;
      await expect(handler(ctx), 'to be fulfilled');
    });

    it('should allow Luna to view post', async () => {
      ctx.state.user = luna;
      await expect(handler(ctx), 'to be fulfilled');
    });

    describe('Luna becomes protected', () => {
      beforeEach(async () => {
        await luna.update({ isProtected: '1' });
      });

      it('should not allow anonymous to view post', async () => {
        await expect(handler(ctx), 'to be rejected with', { status: 403 });
      });

      it('should allow Mars to view post', async () => {
        ctx.state.user = mars;
        await expect(handler(ctx), 'to be fulfilled');
      });

      it('should allow Luna to view post', async () => {
        ctx.state.user = luna;
        await expect(handler(ctx), 'to be fulfilled');
      });
    });

    describe('Luna becomes private', () => {
      beforeEach(async () => {
        await luna.update({ isPrivate: '1' });
      });

      it('should not allow anonymous to view post', async () => {
        await expect(handler(ctx), 'to be rejected with', { status: 403 });
      });

      it('should not allow Mars to view post', async () => {
        ctx.state.user = mars;
        await expect(handler(ctx), 'to be rejected with', { status: 403 });
      });

      it('should allow Luna to view post', async () => {
        ctx.state.user = luna;
        await expect(handler(ctx), 'to be fulfilled');
      });

      describe('Mars subscribes to Luna', () => {
        beforeEach(async () => {
          await mars.subscribeTo(luna);
        });

        it('should allow Mars to view post', async () => {
          ctx.state.user = mars;
          await expect(handler(ctx), 'to be fulfilled');
        });
      });
    });

    describe('Luna bans Mars', () => {
      beforeEach(async () => {
        await luna.ban(mars.username);
      });

      it('should allow anonymous to view post', async () => {
        await expect(handler(ctx), 'to be fulfilled');
      });

      it('should not allow Mars to view post', async () => {
        ctx.state.user = mars;
        await expect(handler(ctx), 'to be rejected with', { status: 403 });
      });

      it('should allow Luna to view post', async () => {
        ctx.state.user = luna;
        await expect(handler(ctx), 'to be fulfilled');
      });
    });

    describe('Mars bans Luna', () => {
      beforeEach(async () => {
        await mars.ban(luna.username);
      });

      it('should allow anonymous to view post', async () => {
        await expect(handler(ctx), 'to be fulfilled');
      });

      it('should not allow Mars to view post', async () => {
        ctx.state.user = mars;
        await expect(handler(ctx), 'to be rejected with', { status: 403 });
      });

      it('should allow Luna to view post', async () => {
        ctx.state.user = luna;
        await expect(handler(ctx), 'to be fulfilled');
      });
    });

    describe('Luna and Mars are friends', () => {
      beforeEach(async () => {
        await Promise.all([mars.subscribeTo(luna), luna.subscribeTo(mars)]);
      });

      describe('Luna writes direct post to mars', () => {
        beforeEach(async () => {
          const [lunaDirectFeed, marsDirectFeed] = await Promise.all([
            luna.getDirectsTimeline(),
            mars.getDirectsTimeline(),
          ]);
          post = new Post({
            body: 'Post body',
            userId: luna.id,
            timelineIds: [lunaDirectFeed.id, marsDirectFeed.id],
            commentsDisabled: '0',
          });
          await post.create();

          ctx = {
            params: { postId: post.id },
            state: {},
          };
        });

        it('should not allow anonymous to view post', async () => {
          await expect(handler(ctx), 'to be rejected with', { status: 403 });
        });

        it('should allow Mars to view post', async () => {
          ctx.state.user = mars;
          await expect(handler(ctx), 'to be fulfilled');
        });

        it('should allow Luna to view post', async () => {
          ctx.state.user = luna;
          await expect(handler(ctx), 'to be fulfilled');
        });
      });
    });
  });
});
