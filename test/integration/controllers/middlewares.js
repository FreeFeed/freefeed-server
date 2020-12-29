/* eslint-env node, mocha */
/* global $pg_database */
import compose from 'koa-compose';
import unexpected from 'unexpected';
import unexpectedSinon from 'unexpected-sinon';
import { noop } from 'lodash';
import sinon from 'sinon';

import cleanDB from '../../dbCleaner';
import {
  postAccessRequired,
  inputSchemaRequired,
  monitored,
} from '../../../app/controllers/middlewares';
import { User, Post } from '../../../app/models';

const expect = unexpected.clone();
expect.use(unexpectedSinon);

describe('Controller middlewares', () => {
  beforeEach(() => cleanDB($pg_database));

  describe('postAccessRequired', () => {
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

  describe('inputSchemaRequired', () => {
    const schema = {
      $schema: 'http://json-schema.org/schema#',
      type: 'object',
      required: ['a'],
      properties: {
        a: { type: 'string' },
        b: { type: 'string', default: 'boo' },
      },
    };

    const handler = (ctx) => inputSchemaRequired(schema)(ctx, noop);
    const ctx = { request: { body: {} } };

    it('should pass the valid request data', async () => {
      ctx.request.body = { a: 'aaa' };
      await expect(handler(ctx), 'to be fulfilled');
    });

    it('should not pass request data without required field', async () => {
      ctx.request.body = { b: 'bbb' };
      await expect(handler(ctx), 'to be rejected with', { status: 422 });
    });

    it('should not pass the invalid request data', async () => {
      ctx.request.body = { a: 'aaa', b: 223 };
      await expect(handler(ctx), 'to be rejected with', { status: 422 });
    });

    it('should complete request data with the defaults', async () => {
      ctx.request.body = { a: 'aaa' };
      await handler(ctx);
      expect(ctx.request.body, 'to equal', { a: 'aaa', b: 'boo' });
    });
  });

  describe('monitored', () => {
    const timer = { stop: sinon.spy() };
    const monitor = {
      increment: sinon.spy(),
      timer: sinon.stub().returns(timer),
    };

    const handler = compose([monitored('test', monitor)]);
    const failHandler = compose([
      monitored('test', monitor),
      () => {
        throw new Error('');
      },
    ]);
    const nestedHandler = compose([monitored('test1', monitor), monitored('test', monitor)]);

    let ctx;
    beforeEach(() => {
      [monitor.increment, monitor.timer, timer.stop].forEach((spy) => spy.resetHistory());
      ctx = { state: {} };
    });

    it(`should increment 'test-requests' counter after successiful call`, async () => {
      await handler(ctx);
      expect(monitor.increment, 'to have a call satisfying', ['test-requests']);
    });

    it(`should not increment 'test-requests' counter after failed call`, async () => {
      try {
        await failHandler(ctx);
      } catch (e) {
        // pass
      }

      expect(monitor.increment, 'was not called');
    });

    it(`should start and stop 'test-time' timer`, async () => {
      await handler(ctx);
      expect(monitor.timer, 'to have a call satisfying', ['test-time']);
      expect(timer.stop, 'was called');
      expect([monitor.timer, timer.stop], 'given call order');
    });

    it(`should clear ctx.state.isMonitored flag`, async () => {
      await handler(ctx);
      expect(ctx.state, 'to not have key', 'isMonitored');
    });

    it(`should not call monitor methods in nested call`, async () => {
      await nestedHandler(ctx);
      expect(monitor.increment, 'to have a call satisfying', ['test1-requests']);
      expect(monitor.timer, 'to have a call satisfying', ['test1-time']);
      expect(monitor.increment, 'was called once');
      expect(monitor.timer, 'was called once');
      expect(timer.stop, 'was called once');
    });

    it(`should use custom counter and timer names`, async () => {
      await monitored({ timer: 'timerA', requests: 'requestsB' }, monitor)(ctx, noop);
      expect(monitor.timer, 'to have a call satisfying', ['timerA']);
      expect(monitor.increment, 'to have a call satisfying', ['requestsB']);
    });
  });
});
