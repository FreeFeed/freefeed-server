/* eslint-env node, mocha */
/* global $database, $pg_database */
import expect from 'unexpected';

import cleanDB from '../dbCleaner';
import { getSingleton } from '../../app/app';
import { PubSub } from '../../app/models';
import { PubSubAdapter } from '../../app/support/PubSubAdapter';

import {
  authHeaders,
  createAndReturnPost,
  createCommentAsync,
  createTestUsers,
  deletePostAsync,
  goPrivate,
  goPublic,
  performJSONRequest,
  removeCommentAsync,
  updateCommentAsync,
  updatePostAsync,
} from './functional_test_helper';
import Session from './realtime-session';

describe('Backlinks in API output', () => {
  let luna, mars;
  let lunaPostId, marsPostId;

  before(async () => {
    await cleanDB($pg_database);
    [luna, mars] = await createTestUsers(['luna', 'mars']);

    ({ id: lunaPostId } = await createAndReturnPost(luna, 'Luna post'));
    ({ id: marsPostId } = await createAndReturnPost(
      mars,
      `As Luna said, example.com/${lunaPostId}`,
    ));
  });

  it(`should return Luna post with 1 backlink`, async () => {
    const resp = await performJSONRequest('GET', `/v2/posts/${lunaPostId}`);
    expect(resp, 'to satisfy', { posts: { backlinksCount: 1 } });
  });

  it(`should return Mars post by Luna post's UUID search`, async () => {
    const resp = await performJSONRequest(
      'GET',
      `/v2/search?qs=${encodeURIComponent(lunaPostId)}`,
      null,
      authHeaders(luna),
    );
    expect(resp, 'to satisfy', { posts: [{ id: marsPostId }] });
  });

  describe('Mars becomes private', () => {
    before(() => goPrivate(mars));
    after(() => goPublic(mars));

    it(`should return Luna post with 0 backlinks to anonymous`, async () => {
      const resp = await performJSONRequest('GET', `/v2/posts/${lunaPostId}`);
      expect(resp, 'to satisfy', { posts: { backlinksCount: 0 } });
    });

    it(`should return Luna post with 0 backlinks to Luna`, async () => {
      const resp = await performJSONRequest(
        'GET',
        `/v2/posts/${lunaPostId}`,
        null,
        authHeaders(luna),
      );
      expect(resp, 'to satisfy', { posts: { backlinksCount: 0 } });
    });

    it(`should return Luna post with 1 backlink to Mars`, async () => {
      const resp = await performJSONRequest(
        'GET',
        `/v2/posts/${lunaPostId}`,
        null,
        authHeaders(mars),
      );
      expect(resp, 'to satisfy', { posts: { backlinksCount: 1 } });
    });
  });
});

describe('Backlinks in realtime', () => {
  let luna, mars;
  let lunaSession;

  before(async () => {
    await cleanDB($pg_database);
    const app = await getSingleton();
    const port = process.env.PEPYATKA_SERVER_PORT || app.context.config.port;
    const pubsubAdapter = new PubSubAdapter($database);
    PubSub.setPublisher(pubsubAdapter);

    [luna, mars] = await createTestUsers(['luna', 'mars']);
    lunaSession = await Session.create(port, 'Luna session');
    await lunaSession.sendAsync('auth', { authToken: luna.authToken });

    // Luna subscribed to her timeline
    const lunaTimeline = await luna.user.getPostsTimeline();
    await lunaSession.sendAsync('subscribe', { timeline: [lunaTimeline.id] });

    // Luna created post
    luna.post = await createAndReturnPost(luna, 'Luna post');
  });

  describe('Mars is public', () => {
    it(`should deliver 'post:update' to the Luna when Mars creates post with her post ID`, async () => {
      const test = lunaSession.receiveWhile(
        'post:update',
        async () =>
          (mars.post = await createAndReturnPost(
            mars,
            `As Luna said, example.com/${luna.post.id}`,
          )),
      );
      await expect(test, 'when fulfilled', 'to satisfy', {
        posts: { id: luna.post.id, backlinksCount: 1 },
      });
    });

    it(`should not deliver 'post:update' to the Luna when Mars updates post keeping her post ID`, async () => {
      const test = lunaSession.notReceiveWhile('post:update', () =>
        updatePostAsync(mars, { body: `As Luna said, again, example.com/${luna.post.id}` }),
      );
      await expect(test, 'to be fulfilled');
    });

    it(`should deliver 'post:update' to the Luna when Mars updates post and removes her post ID`, async () => {
      const test = lunaSession.receiveWhile('post:update', () =>
        updatePostAsync(mars, { body: `As Luna said, hmm...` }),
      );
      await expect(test, 'when fulfilled', 'to satisfy', {
        posts: { id: luna.post.id, backlinksCount: 0 },
      });
    });

    it(`should deliver 'post:update' to the Luna when Mars updates post and returns her post ID`, async () => {
      const test = lunaSession.receiveWhile('post:update', () =>
        updatePostAsync(mars, { body: `As Luna said, again, example.com/${luna.post.id}` }),
      );
      await expect(test, 'when fulfilled', 'to satisfy', {
        posts: { id: luna.post.id, backlinksCount: 1 },
      });
    });

    it(`should deliver 'post:update' to the Luna when Mars removes post with her post ID`, async () => {
      const test = lunaSession.receiveWhile('post:update', () =>
        deletePostAsync(mars, mars.post.id),
      );
      await expect(test, 'when fulfilled', 'to satisfy', {
        posts: { id: luna.post.id, backlinksCount: 0 },
      });
    });
  });

  describe('Mars is private', () => {
    before(() => goPrivate(mars));
    after(() => goPublic(mars));

    it(`should not deliver 'post:update' to the Luna when Mars creates post with her post ID`, async () => {
      const test = lunaSession.notReceiveWhile(
        'post:update',
        async () =>
          (mars.post = await createAndReturnPost(
            mars,
            `As Luna said, example.com/${luna.post.id}`,
          )),
      );
      await expect(test, 'to be fulfilled');
    });

    it(`should not deliver 'post:update' to the Luna when Mars updates post keeping her post ID`, async () => {
      const test = lunaSession.notReceiveWhile('post:update', () =>
        updatePostAsync(mars, { body: `As Luna said, again, example.com/${luna.post.id}` }),
      );
      await expect(test, 'to be fulfilled');
    });

    it(`should not deliver 'post:update' to the Luna when Mars updates post and removes her post ID`, async () => {
      const test = lunaSession.notReceiveWhile('post:update', () =>
        updatePostAsync(mars, { body: `As Luna said, hmm...` }),
      );
      await expect(test, 'to be fulfilled');
    });

    it(`should not deliver 'post:update' to the Luna when Mars updates post and returns her post ID`, async () => {
      const test = lunaSession.notReceiveWhile('post:update', () =>
        updatePostAsync(mars, { body: `As Luna said, again, example.com/${luna.post.id}` }),
      );
      await expect(test, 'to be fulfilled');
    });

    it(`should not deliver 'post:update' to the Luna when Mars removes post with her post ID`, async () => {
      const test = lunaSession.notReceiveWhile('post:update', () =>
        deletePostAsync(mars, mars.post.id),
      );
      await expect(test, 'to be fulfilled');
    });
  });

  describe('Backlinks in comments', () => {
    before(async () => (mars.post = await createAndReturnPost(mars, `Just a post`)));
    after(() => deletePostAsync(mars, mars.post.id));

    describe('Mars is public', () => {
      it(`should deliver 'post:update' to the Luna when Mars creates comment with her post ID`, async () => {
        const test = lunaSession.receiveWhile(
          'post:update',
          async () =>
            ({ comments: mars.comment } = await createCommentAsync(
              mars,
              mars.post.id,
              `As Luna said, example.com/${luna.post.id}`,
            ).then((r) => r.json())),
        );
        await expect(test, 'when fulfilled', 'to satisfy', {
          posts: { id: luna.post.id, backlinksCount: 1 },
        });
      });

      it(`should not deliver 'post:update' to the Luna when Mars updates comment keeping her post ID`, async () => {
        const test = lunaSession.notReceiveWhile('post:update', () =>
          updateCommentAsync(
            mars,
            mars.comment.id,
            `As Luna said, again, example.com/${luna.post.id}`,
          ),
        );
        await expect(test, 'to be fulfilled');
      });

      it(`should deliver 'post:update' to the Luna when Mars updates comment and removes her post ID`, async () => {
        const test = lunaSession.receiveWhile('post:update', () =>
          updateCommentAsync(mars, mars.comment.id, `As Luna said, hmm...`),
        );
        await expect(test, 'when fulfilled', 'to satisfy', {
          posts: { id: luna.post.id, backlinksCount: 0 },
        });
      });

      it(`should deliver 'post:update' to the Luna when Mars updates comment and returns her post ID`, async () => {
        const test = lunaSession.receiveWhile('post:update', () =>
          updateCommentAsync(
            mars,
            mars.comment.id,
            `As Luna said, again, example.com/${luna.post.id}`,
          ),
        );
        await expect(test, 'when fulfilled', 'to satisfy', {
          posts: { id: luna.post.id, backlinksCount: 1 },
        });
      });

      it(`should deliver 'post:update' to the Luna when Mars removes comment with her post ID`, async () => {
        const test = lunaSession.receiveWhile('post:update', () =>
          removeCommentAsync(mars, mars.comment.id),
        );
        await expect(test, 'when fulfilled', 'to satisfy', {
          posts: { id: luna.post.id, backlinksCount: 0 },
        });
      });
    });

    describe('Mars is private', () => {
      before(() => goPrivate(mars));
      after(() => goPublic(mars));

      it(`should not deliver 'post:update' to the Luna when Mars creates comment with her post ID`, async () => {
        const test = lunaSession.notReceiveWhile(
          'post:update',
          async () =>
            ({ comments: mars.comment } = await createCommentAsync(
              mars,
              mars.post.id,
              `As Luna said, example.com/${luna.post.id}`,
            ).then((r) => r.json())),
        );
        await expect(test, 'to be fulfilled');
      });

      it(`should not deliver 'post:update' to the Luna when Mars updates comment keeping her post ID`, async () => {
        const test = lunaSession.notReceiveWhile('post:update', () =>
          updateCommentAsync(
            mars,
            mars.comment.id,
            `As Luna said, again, example.com/${luna.post.id}`,
          ),
        );
        await expect(test, 'to be fulfilled');
      });

      it(`should not deliver 'post:update' to the Luna when Mars updates comment and removes her post ID`, async () => {
        const test = lunaSession.notReceiveWhile('post:update', () =>
          updateCommentAsync(mars, mars.comment.id, `As Luna said, hmm...`),
        );
        await expect(test, 'to be fulfilled');
      });

      it(`should not deliver 'post:update' to the Luna when Mars updates comment and returns her post ID`, async () => {
        const test = lunaSession.notReceiveWhile('post:update', () =>
          updateCommentAsync(
            mars,
            mars.comment.id,
            `As Luna said, again, example.com/${luna.post.id}`,
          ),
        );
        await expect(test, 'to be fulfilled');
      });

      it(`should not deliver 'post:update' to the Luna when Mars removes comment with her post ID`, async () => {
        const test = lunaSession.notReceiveWhile('post:update', () =>
          removeCommentAsync(mars, mars.comment.id),
        );
        await expect(test, 'to be fulfilled');
      });
    });
  });
});
