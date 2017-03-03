/* eslint-env node, mocha */
/* global $pg_database */
import knexCleaner from 'knex-cleaner';
import expect from 'unexpected';

import { getSingleton } from '../../app/app';
import { DummyPublisher } from '../../app/pubsub';
import { PubSub, Comment } from '../../app/models';
import {
  fetchPost,
  fetchTimeline,
  createUserAsync,
  createAndReturnPost,
  createCommentAsync,
  banUser,
  updateUserAsync,
} from './functional_test_helper';

describe('Hidden comments', () => {
  before(async () => {
    await getSingleton();
    PubSub.setPublisher(new DummyPublisher());
  });

  beforeEach(async () => await knexCleaner.clean($pg_database));

  describe('Luna is viewer, Mars is a post author, Venus banned by Luna', () => {
    let luna, mars, venus;
    let post;
    beforeEach(async () => {
      [luna, mars, venus] = await Promise.all([
        createUserAsync('luna', 'pw'),
        createUserAsync('mars', 'pw'),
        createUserAsync('venus', 'pw'),
      ]);
      await banUser(luna, venus);
      post = await createAndReturnPost(mars, 'Mars post');
      await createCommentAsync(venus, post.id, 'Comment from Venus');
      await createCommentAsync(luna, post.id, 'Comment from Luna');
    });

    describe('Luna want to see comments from banned users', () => {
      beforeEach(async () => {
        await updateUserAsync(
          luna,
          { frontendPreferences: { 'net.freefeed': { comments: { hiddenTypes: [] } } } },
        );
      });

      it('should return post (API v2) with hidden Venus comment', async () => {
        const reply = await fetchPost(post.id, luna);
        expect(reply.comments, 'to have length', 2);
        const venusComment = reply.comments.find((c) => c.id === reply.posts.comments[0]);
        const lunaComment =  reply.comments.find((c) => c.id === reply.posts.comments[1]);
        expect(venusComment, 'to satisfy', { hideType: Comment.HIDDEN_BANNED });
        expect(lunaComment,  'to satisfy', { hideType: Comment.VISIBLE });
      });

      it('should return timeline (API v2) with hidden Venus comment', async () => {
        const reply = await fetchTimeline('mars', luna);
        const postInReply = reply.posts[0];
        expect(reply.comments, 'to have length', 2);
        const venusComment = reply.comments.find((c) => c.id === postInReply.comments[0]);
        const lunaComment =  reply.comments.find((c) => c.id === postInReply.comments[1]);
        expect(venusComment, 'to satisfy', { hideType: Comment.HIDDEN_BANNED });
        expect(lunaComment,  'to satisfy', { hideType: Comment.VISIBLE });
      });

      it('should return post (API v1) with hidden Venus comment', async () => {
        const reply = await fetchPost(post.id, luna, { apiVersion: 'v1' });
        expect(reply.comments, 'to have length', 2);
        const venusComment = reply.comments.find((c) => c.id === reply.posts.comments[0]);
        const lunaComment =  reply.comments.find((c) => c.id === reply.posts.comments[1]);
        expect(venusComment, 'to satisfy', { hideType: Comment.HIDDEN_BANNED });
        expect(lunaComment,  'to not have key', 'hideType');
      });

      it('should return timeline (API v1) with hidden Venus comment', async () => {
        const reply = await fetchTimeline('mars', luna, 'v1');
        const postInReply = reply.posts[0];
        expect(reply.comments, 'to have length', 2);
        const venusComment = reply.comments.find((c) => c.id === postInReply.comments[0]);
        const lunaComment =  reply.comments.find((c) => c.id === postInReply.comments[1]);
        expect(venusComment, 'to satisfy', { hideType: Comment.HIDDEN_BANNED });
        expect(lunaComment,  'to not have key', 'hideType');
      });
    });

    describe('Luna doesn\'t want to see comments from banned users', () => {
      beforeEach(async () => {
        await updateUserAsync(
          luna,
          { frontendPreferences: { 'net.freefeed': { comments: { hiddenTypes: [Comment.HIDDEN_BANNED] } } } },
        );
      });

      it('should return post (API v2) without Venus comment', async () => {
        const reply = await fetchPost(post.id, luna);
        expect(reply.comments, 'to have length', 1);
        expect(reply.comments[0],  'to satisfy', { hideType: Comment.VISIBLE });
      });

      it('should return timeline (API v2) without Venus comment', async () => {
        const reply = await fetchTimeline('mars', luna);
        expect(reply.comments, 'to have length', 1);
        expect(reply.comments[0],  'to satisfy', { hideType: Comment.VISIBLE });
      });

      it('should return post (API v1) without Venus comment', async () => {
        const reply = await fetchPost(post.id, luna, { apiVersion: 'v1' });
        expect(reply.comments, 'to have length', 1);
        expect(reply.comments[0],  'to not have key', 'hideType');
      });

      it('should return timeline (API v1) without Venus comment', async () => {
        const reply = await fetchTimeline('mars', luna, 'v1');
        expect(reply.comments, 'to have length', 1);
        expect(reply.comments[0],  'to not have key', 'hideType');
      });
    });
  });
});
