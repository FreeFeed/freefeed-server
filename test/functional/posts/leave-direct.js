/* eslint-env node, mocha */
/* global $database, $pg_database */
import expect from 'unexpected';

import cleanDB from '../../dbCleaner';
import { getSingleton } from '../../../app/app';
import { PubSubAdapter } from '../../../app/support/PubSubAdapter';
import { PubSub } from '../../../app/models';
import {
  authHeaders,
  createAndReturnPostToFeed,
  createTestUsers,
  mutualSubscriptions,
  performJSONRequest,
} from '../functional_test_helper';
import Session from '../realtime-session';

describe('POST /v2/posts/:postId/leave', () => {
  let luna, mars, venus, jupiter;
  beforeEach(async () => {
    await cleanDB($pg_database);

    [luna, mars, venus, jupiter] = await createTestUsers(['luna', 'mars', 'venus', 'jupiter']);
    await mutualSubscriptions([luna, mars, venus, jupiter]);
  });

  describe('Luna create direct with Mars and Venus', () => {
    let post;
    beforeEach(async () => {
      post = await createAndReturnPostToFeed([mars.user, venus.user], luna, 'Hello');
    });

    it('should allow Mars to leave direct', async () => {
      const resp = await leave(post, mars);
      expect(resp, 'to satisfy', { __httpCode: 200 });
    });

    it('should allow Venus to leave direct', async () => {
      const resp = await leave(post, mars);
      expect(resp, 'to satisfy', { __httpCode: 200 });
    });

    it('should not allow Luna to leave direct', async () => {
      const resp = await leave(post, luna);
      expect(resp, 'to satisfy', { __httpCode: 403 });
    });

    it('should not allow Jupiter to leave direct', async () => {
      const resp = await leave(post, jupiter);
      expect(resp, 'to satisfy', { __httpCode: 403 });
    });

    it('should not allow anonymous to leave direct', async () => {
      const resp = await leave(post, null);
      expect(resp, 'to satisfy', { __httpCode: 401 });
    });

    describe('Mars leaving direct', () => {
      beforeEach(() => leave(post, mars));

      it('should not allow Mars to see post', async () => {
        const resp = await getPost(post, mars);
        expect(resp, 'to satisfy', { __httpCode: 403 });
      });

      it('should allow Luna to see post', async () => {
        const resp = await getPost(post, luna);
        expect(resp, 'to satisfy', { __httpCode: 200 });
      });

      it('should allow Venus to see post', async () => {
        const resp = await getPost(post, venus);
        expect(resp, 'to satisfy', { __httpCode: 200 });
      });

      it(`should show post in Luna's homefdeed`, async () => {
        const resp = await getHome(luna);
        expect(resp, 'to satisfy', { timelines: { posts: [post.id] } });
      });

      it(`should show post in Venuses homefdeed`, async () => {
        const resp = await getHome(venus);
        expect(resp, 'to satisfy', { timelines: { posts: [post.id] } });
      });

      it(`should not show post in Marses homefdeed`, async () => {
        const resp = await getHome(mars);
        expect(resp, 'to satisfy', { timelines: { posts: [] } });
      });
    });

    describe('Mars and Venus leaving direct', () => {
      beforeEach(async () => {
        await leave(post, mars);
        await leave(post, venus);
      });

      it('should not allow Mars to see post', async () => {
        const resp = await getPost(post, mars);
        expect(resp, 'to satisfy', { __httpCode: 403 });
      });

      it('should allow Luna to see post', async () => {
        const resp = await getPost(post, luna);
        expect(resp, 'to satisfy', { __httpCode: 200 });
      });

      it('should not allow Venus to see post', async () => {
        const resp = await getPost(post, venus);
        expect(resp, 'to satisfy', { __httpCode: 403 });
      });

      it(`should show post in Luna's homefdeed`, async () => {
        const resp = await getHome(luna);
        expect(resp, 'to satisfy', { timelines: { posts: [post.id] } });
      });

      it(`should not show post in Venuses homefdeed`, async () => {
        const resp = await getHome(venus);
        expect(resp, 'to satisfy', { timelines: { posts: [] } });
      });

      it(`should not show post in Marses homefdeed`, async () => {
        const resp = await getHome(mars);
        expect(resp, 'to satisfy', { timelines: { posts: [] } });
      });
    });

    xdescribe('Realtime', () => {
      let port;

      before(async () => {
        const app = await getSingleton();
        port = process.env.PEPYATKA_SERVER_PORT || app.context.config.port;
        const pubsubAdapter = new PubSubAdapter($database);
        PubSub.setPublisher(pubsubAdapter);
      });

      let lunaSession, marsSession;

      beforeEach(async () => {
        [lunaSession, marsSession] = await Promise.all([
          Session.create(port, 'Luna session'),
          Session.create(port, 'Mars session'),
        ]);

        await Promise.all([
          lunaSession.sendAsync('auth', { authToken: luna.authToken }),
          marsSession.sendAsync('auth', { authToken: mars.authToken }),
        ]);

        await Promise.all([
          lunaSession.sendAsync('subscribe', { post: [post.id] }),
          marsSession.sendAsync('subscribe', { post: [post.id] }),
        ]);
      });

      afterEach(() => [lunaSession, marsSession].forEach((s) => s.disconnect()));

      it(`should deliver 'post:destroy' event to Mars when he leaves post`, async () => {
        const test = marsSession.receiveWhile('post:destroy', () => leave(post, mars));
        await expect(test, 'to be fulfilled with', { meta: { postId: post.id } });
      });

      it(`should not deliver 'post:destroy' event to Luna when Mars leaves post`, async () => {
        const test = lunaSession.notReceiveWhile('post:destroy', () => leave(post, mars));
        await expect(test, 'to be fulfilled');
      });
    });
  });
});

const leave = (post, ctx) =>
  performJSONRequest('POST', `/v2/posts/${post.id}/leave`, {}, authHeaders(ctx));

const getPost = (post, ctx) =>
  performJSONRequest('GET', `/v2/posts/${post.id}`, null, authHeaders(ctx));

const getHome = (ctx) => performJSONRequest('GET', `/v2/timelines/home`, null, authHeaders(ctx));
