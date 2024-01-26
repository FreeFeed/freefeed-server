/* eslint-env node, mocha */
import expect from 'unexpected';

import { getSingleton } from '../../app/app';
import { PubSubAdapter, eventNames as ev } from '../../app/support/PubSubAdapter';
import { PubSub } from '../../app/models';
import { connect as pgConnect } from '../../app/setup/postgres';
import redisDb from '../../app/setup/database';
import cleanDB from '../dbCleaner';

import Session from './realtime-session';
import {
  createTestUsers,
  createAndReturnPost,
  like,
  performJSONRequest,
  authHeaders,
  createCommentAsync,
  likeComment,
} from './functional_test_helper';

describe('Realtime events from inaccessible posts', () => {
  let port;

  before(async () => {
    const app = await getSingleton();
    port = process.env.PEPYATKA_SERVER_PORT || app.context.config.port;
    const pubsubAdapter = new PubSubAdapter(redisDb);
    PubSub.setPublisher(pubsubAdapter);
  });
  beforeEach(() => cleanDB(pgConnect()));

  let luna, mars, venus, lunaSession, marsSession;
  let post;

  // Luna subscribed to Mars, Mars subscribed to Venus, Venus is private
  beforeEach(async () => {
    [luna, mars, venus] = await createTestUsers(['luna', 'mars', 'venus']);

    [lunaSession, marsSession] = await Promise.all([
      Session.create(port, 'Luna session'),
      Session.create(port, 'Mars session'),
    ]);

    // Luna subscribed to Mars, Mars subscribed to Venus
    await Promise.all([luna.user.subscribeTo(mars.user), mars.user.subscribeTo(venus.user)]);
    // Venus goes private
    await venus.user.update({ isPrivate: '1', isProtected: '1' });

    await Promise.all([
      lunaSession.sendAsync('auth', { authToken: luna.authToken }),
      marsSession.sendAsync('auth', { authToken: mars.authToken }),
    ]);

    // Luna and Mars are listening to their home feeds
    const [lunaHomeFeedId, marsHomeFeedId] = await Promise.all([
      luna.user.getRiverOfNewsTimelineId(),
      mars.user.getRiverOfNewsTimelineId(),
    ]);
    await Promise.all([
      lunaSession.sendAsync('subscribe', { timeline: [lunaHomeFeedId] }),
      marsSession.sendAsync('subscribe', { timeline: [marsHomeFeedId] }),
    ]);

    // Venus creates post
    post = await createAndReturnPost(venus, 'Venus post');
  });

  describe('Mars likes Venus post', () => {
    it(`should deliver ${ev.LIKE_ADDED} to Mars`, async () => {
      const test = marsSession.receiveWhile(ev.LIKE_ADDED, () => like(post.id, mars.authToken));
      await expect(test, 'to be fulfilled');
    });

    it(`should NOT deliver ${ev.LIKE_ADDED} to Luna`, async () => {
      const test = lunaSession.notReceiveWhile(ev.LIKE_ADDED, () => like(post.id, mars.authToken));
      await expect(test, 'to be fulfilled');
    });
  });

  describe('Venus updates post liked by Mars', () => {
    beforeEach(() => like(post.id, mars.authToken));

    const updatePost = () =>
      performJSONRequest(
        'PUT',
        `/v2/posts/${post.id}`,
        { post: { body: 'Updated Venus post' } },
        authHeaders(venus),
      );

    it(`should deliver ${ev.POST_UPDATED} to Mars`, async () => {
      const test = marsSession.receiveWhile(ev.POST_UPDATED, updatePost);
      await expect(test, 'to be fulfilled');
    });

    it(`should NOT deliver ${ev.POST_UPDATED} to Luna`, async () => {
      const test = lunaSession.notReceiveWhile(ev.POST_UPDATED, updatePost);
      await expect(test, 'to be fulfilled');
    });
  });

  describe('Venus removes post liked by Mars', () => {
    beforeEach(() => like(post.id, mars.authToken));

    const deletePost = () =>
      performJSONRequest('DELETE', `/v2/posts/${post.id}`, null, authHeaders(venus));

    it(`should deliver ${ev.POST_DESTROYED} to Mars`, async () => {
      const test = marsSession.receiveWhile(ev.POST_DESTROYED, deletePost);
      await expect(test, 'to be fulfilled');
    });

    it(`should NOT deliver ${ev.POST_DESTROYED} to Luna`, async () => {
      const test = lunaSession.notReceiveWhile(ev.POST_DESTROYED, deletePost);
      await expect(test, 'to be fulfilled');
    });
  });

  describe('Venus commented post liked by Mars', () => {
    beforeEach(() => like(post.id, mars.authToken));

    const commentPost = () => createCommentAsync(venus, post.id, 'Hello');

    it(`should deliver ${ev.COMMENT_CREATED} to Mars`, async () => {
      const test = marsSession.receiveWhile(ev.COMMENT_CREATED, commentPost);
      await expect(test, 'to be fulfilled');
    });

    it(`should NOT deliver ${ev.COMMENT_CREATED} to Luna`, async () => {
      const test = lunaSession.notReceiveWhile(ev.COMMENT_CREATED, commentPost);
      await expect(test, 'to be fulfilled');
    });
  });

  describe('Venus liked comment of post commented by Mars', () => {
    let comment;
    beforeEach(async () => {
      comment = await createCommentAsync(mars, post.id, 'Hello')
        .then((r) => r.json())
        .then((r) => r.comments);
    });

    const cLike = () => likeComment(comment.id, venus);

    it(`should deliver ${ev.COMMENT_LIKE_ADDED} to Mars`, async () => {
      const test = marsSession.receiveWhile(ev.COMMENT_LIKE_ADDED, cLike);
      await expect(test, 'to be fulfilled');
    });

    it(`should NOT deliver ${ev.COMMENT_LIKE_ADDED} to Luna`, async () => {
      const test = lunaSession.notReceiveWhile(ev.COMMENT_LIKE_ADDED, cLike);
      await expect(test, 'to be fulfilled');
    });
  });
});
