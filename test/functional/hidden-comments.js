/* eslint-env node, mocha */
/* global $database, $pg_database */
import expect from 'unexpected';

import cleanDB from '../dbCleaner';
import { getSingleton } from '../../app/app';
import { PubSub, Comment } from '../../app/models';
import { eventNames, PubSubAdapter } from '../../app/support/PubSubAdapter';

import {
  fetchPost,
  fetchTimeline,
  createUserAsync,
  createAndReturnPost,
  createCommentAsync,
  banUser,
  updateUserAsync,
  removeCommentAsync,
} from './functional_test_helper';
import Session from './realtime-session';


describe('Hidden comments', () => {
  let app;
  before(async () => {
    app = await getSingleton();
    const pubsubAdapter = new PubSubAdapter($database)
    PubSub.setPublisher(pubsubAdapter)
  });

  beforeEach(() => cleanDB($pg_database));

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
          { preferences: { hideCommentsOfTypes: [] } },
        );
      });

      it('should return post with hidden Venus comment', async () => {
        const reply = await fetchPost(post.id, luna);
        expect(reply.comments, 'to have length', 2);
        const venusComment = reply.comments.find((c) => c.id === reply.posts.comments[0]);
        const lunaComment =  reply.comments.find((c) => c.id === reply.posts.comments[1]);
        expect(venusComment, 'to satisfy', { hideType: Comment.HIDDEN_BANNED });
        expect(lunaComment,  'to satisfy', { hideType: Comment.VISIBLE });
      });

      it('should return timeline with hidden Venus comment', async () => {
        const reply = await fetchTimeline('mars', luna);
        const [postInReply] = reply.posts;
        expect(reply.comments, 'to have length', 2);
        const venusComment = reply.comments.find((c) => c.id === postInReply.comments[0]);
        const lunaComment =  reply.comments.find((c) => c.id === postInReply.comments[1]);
        expect(venusComment, 'to satisfy', { hideType: Comment.HIDDEN_BANNED });
        expect(lunaComment,  'to satisfy', { hideType: Comment.VISIBLE });
      });

      describe('Luna is listening for the post events', () => {
        let lunaSession;
        beforeEach(async () => {
          const port = process.env.PEPYATKA_SERVER_PORT || app.context.config.port;
          lunaSession = await Session.create(port, 'Luna session')
          await lunaSession.sendAsync('auth', { authToken: luna.authToken });
          await lunaSession.sendAsync('subscribe', { 'post': [post.id] });
        });
        afterEach(() => lunaSession.disconnect());

        it(`should deliver 'comment:new' event about hidden comment to Luna`, async () => {
          const test = lunaSession.receiveWhile(
            eventNames.COMMENT_CREATED,
            () => createCommentAsync(venus, post.id, 'Another comment from Venus')
          );
          await expect(test, 'when fulfilled', 'to satisfy', {
            comments: {
              createdBy: null,
              hideType:  Comment.HIDDEN_BANNED,
              body:      Comment.hiddenBody(Comment.HIDDEN_BANNED),
            }
          });
        });
      });
    });

    describe('Luna doesn\'t want to see comments from banned users', () => {
      beforeEach(async () => {
        await updateUserAsync(
          luna,
          { preferences: { hideCommentsOfTypes: [Comment.HIDDEN_BANNED] } },
        );
      });

      it('should return post without Venus comment', async () => {
        const reply = await fetchPost(post.id, luna);
        expect(reply.comments, 'to have length', 1);
        expect(reply.comments[0],  'to satisfy', { hideType: Comment.VISIBLE });
      });

      it('should return timeline without Venus comment', async () => {
        const reply = await fetchTimeline('mars', luna);
        expect(reply.comments, 'to have length', 1);
        expect(reply.comments[0],  'to satisfy', { hideType: Comment.VISIBLE });
      });
    });

    describe('Delete hidden comment', () => {
      beforeEach(async () => {
        await banUser(mars, venus);
        await updateUserAsync(
          mars,
          { preferences: { hideCommentsOfTypes: [] } },
        );
      });

      it('Mars should be able to delete hidden Venus comment', async () => {
        const reply1 = await fetchPost(post.id, mars);
        expect(reply1.comments, 'to have length', 2);
        const venusComment = reply1.comments.find((c) => c.id === reply1.posts.comments[0]);
        expect(venusComment,  'to satisfy', { hideType: Comment.HIDDEN_BANNED });

        const delReply = await removeCommentAsync(mars, venusComment.id)
        delReply.status.should.eql(200)

        const reply2 = await fetchPost(post.id, mars);
        expect(reply2.comments, 'to have length', 1);
        const lunaComment =  reply2.comments.find((c) => c.id === reply2.posts.comments[0]);
        expect(lunaComment,  'to satisfy', { hideType: Comment.VISIBLE });
      });
    });
  });
});
