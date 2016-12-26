/* eslint-env node, mocha */
/* global $pg_database */
import fetch from 'node-fetch'
import knexCleaner from 'knex-cleaner'
import expect from 'unexpected'

import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub } from '../../app/models'
import {
  createUserAsync,
  createAndReturnPost,
  subscribeToAsync,
  like,
  createCommentAsync,
  banUser,
  goPrivate,
  sendRequestToSubscribe,
  acceptRequestToSubscribe,
  hidePost,
  createGroupAsync,
  createAndReturnPostToFeed,
} from './functional_test_helper'
import * as schema from './schemaV2-helper';

describe('TimelinesControllerV2', () => {
  let app;

  before(async () => {
    app = await getSingleton();
    PubSub.setPublisher(new DummyPublisher());
  });

  beforeEach(async () => await knexCleaner.clean($pg_database));

  describe('#home()', () => {
    it('should reject unauthenticated users', async () => {
      const response = await fetch(`${app.context.config.host}/v2/timelines/home`);
      expect(response, 'to satisfy', { status: 401 });
      const data = await response.json();
      expect(data, 'to have key', 'err');
    });

    describe('Viewer Luna', () => {
      let luna;
      beforeEach(async () => luna = await createUserAsync('luna', 'pw'));

      it('should return proper structure for authenticated user', async () => {
        await fetchHomefeed(app, luna);
      });

      it('should return empty timeline for newborn user', async () => {
        const homefeed = await fetchHomefeed(app, luna);
        expect(homefeed.posts, 'to be empty');
        expect(homefeed.comments, 'to be empty');
        expect(homefeed.attachments, 'to be empty');
      });

      it('should return timeline with one viewer\'s post', async () => {
        const post = await createAndReturnPost(luna, 'Luna post');
        const homefeed = await fetchHomefeed(app, luna);
        expect(homefeed.posts, 'to have length', 1);
        expect(homefeed.posts[0].id, 'to be', post.id);
      });

      describe('Luna subscribed to Mars and not subscribed to Venus', () => {
        let mars;
        let venus;
        beforeEach(async () => {
          mars = await createUserAsync('mars', 'pw');
          venus = await createUserAsync('venus', 'pw');
          await subscribeToAsync(luna, mars);
        });

        it('should return timeline with Marses post', async () => {
          const post = await createAndReturnPost(mars, 'Mars post');

          const homefeed = await fetchHomefeed(app, luna);
          expect(homefeed.timelines.posts, 'to have length', 1);
          expect(homefeed.timelines.posts[0], 'to be', post.id);
        });

        it('should return timeline with newest posts at first', async () => {
          const post1 = await createAndReturnPost(mars, 'Mars post');
          const post2 = await createAndReturnPost(luna, 'Luna post');

          const homefeed = await fetchHomefeed(app, luna);
          expect(homefeed.timelines.posts, 'to have length', 2);
          expect(homefeed.timelines.posts[0], 'to be', post2.id);
          expect(homefeed.timelines.posts[1], 'to be', post1.id);
        });

        it('should return timeline with updated (by comment) posts at first', async () => {
          const post1 = await createAndReturnPost(mars, 'Mars post');
          const post2 = await createAndReturnPost(luna, 'Luna post');
          await createCommentAsync(mars, post1.id, 'Comment');

          const homefeed = await fetchHomefeed(app, luna);
          expect(homefeed.timelines.posts, 'to have length', 2);
          expect(homefeed.timelines.posts[0], 'to be', post1.id);
          expect(homefeed.timelines.posts[1], 'to be', post2.id);
          expect(homefeed.comments, 'to have length', 1);
        });

        it('should return timeline with post commented by friend', async () => {
          const post1 = await createAndReturnPost(mars, 'Mars post');
          const post2 = await createAndReturnPost(luna, 'Luna post');
          const post3 = await createAndReturnPost(venus, 'Venus post');
          await createCommentAsync(mars, post3.id, 'Comment');

          const homefeed = await fetchHomefeed(app, luna);
          expect(homefeed.timelines.posts, 'to have length', 3);
          expect(homefeed.timelines.posts[0], 'to be', post3.id);
          expect(homefeed.timelines.posts[1], 'to be', post2.id);
          expect(homefeed.timelines.posts[2], 'to be', post1.id);
          expect(homefeed.comments, 'to have length', 1);
        });

        it('should return timeline with post liked by friend at first place (local bump)', async () => {
          const post1 = await createAndReturnPost(venus, 'Venus post');
          const post2 = await createAndReturnPost(mars, 'Mars post');
          const post3 = await createAndReturnPost(luna, 'Luna post');
          await like(post1.id, mars.authToken);

          const homefeed = await fetchHomefeed(app, luna);
          expect(homefeed.timelines.posts, 'to have length', 3);
          expect(homefeed.timelines.posts[0], 'to be', post1.id);
          expect(homefeed.timelines.posts[1], 'to be', post3.id);
          expect(homefeed.timelines.posts[2], 'to be', post2.id);
          const venusPost = homefeed.posts.find((p) => p.id === post1.id);
          expect(venusPost.likes, 'to have length', 1);
        });

        it('should return timeline without post of banned user', async () => {
          const post1 = await createAndReturnPost(venus, 'Venus post');
          const post2 = await createAndReturnPost(mars, 'Mars post');
          const post3 = await createAndReturnPost(luna, 'Luna post');
          await like(post1.id, mars.authToken);
          await banUser(venus, luna);

          const homefeed = await fetchHomefeed(app, luna);
          expect(homefeed.timelines.posts, 'to have length', 2);
          expect(homefeed.timelines.posts[0], 'to be', post3.id);
          expect(homefeed.timelines.posts[1], 'to be', post2.id);
        });

        it('should return timeline without post of user who is banned viewer', async () => {
          const post1 = await createAndReturnPost(venus, 'Venus post');
          const post2 = await createAndReturnPost(mars, 'Mars post');
          const post3 = await createAndReturnPost(luna, 'Luna post');
          await like(post1.id, mars.authToken);
          await banUser(luna, venus);

          const homefeed = await fetchHomefeed(app, luna);
          expect(homefeed.timelines.posts, 'to have length', 2);
          expect(homefeed.timelines.posts[0], 'to be', post3.id);
          expect(homefeed.timelines.posts[1], 'to be', post2.id);
        });

        it('hidden posts should have a isHidden property', async () => {
          const post1 = await createAndReturnPost(mars, 'Mars post');
          const post2 = await createAndReturnPost(luna, 'Luna post');
          await hidePost(post1.id, luna);

          const homefeed = await fetchHomefeed(app, luna);
          expect(homefeed.timelines.posts, 'to have length', 2);
          expect(homefeed.timelines.posts[0], 'to be', post2.id);
          expect(homefeed.timelines.posts[1], 'to be', post1.id);
          const marsPost = homefeed.posts.find((p) => p.id === post1.id);
          expect(marsPost, 'to have key', 'isHidden');
          expect(marsPost.isHidden, 'to be', true);
        });

        describe('Venus have a private feed, Mars is subscribed to Venus', () => {
          beforeEach(async () => {
            await goPrivate(venus);
            await sendRequestToSubscribe(mars, venus);
            await acceptRequestToSubscribe(mars, venus);
          });

          it('should return timeline without posts from Venus liked by Mars', async () => {
            const post = await createAndReturnPost(venus, 'Venus post');
            await like(post.id, mars.authToken);

            const homefeed = await fetchHomefeed(app, luna);
            expect(homefeed.timelines.posts, 'to have length', 0);
          });

          it('should return timeline without posts from Venus commented by Mars', async () => {
            const post = await createAndReturnPost(venus, 'Venus post');
            await createCommentAsync(mars, post.id, 'Comment');

            const homefeed = await fetchHomefeed(app, luna);
            expect(homefeed.timelines.posts, 'to have length', 0);
          });
        });

        describe('Luna subscribed to Selenites group and not subscribed to Celestials group', () => {
          let selenitesPost, celestialsPost;

          beforeEach(async () => {
            await createGroupAsync(venus, 'selenites');
            await createGroupAsync(venus, 'celestials');
            await subscribeToAsync(luna, { username: 'selenites' });

            selenitesPost = await createAndReturnPostToFeed({ username: 'selenites' }, venus, 'Post');
            celestialsPost = await createAndReturnPostToFeed({ username: 'celestials' }, venus, 'Post');
          });

          it('should return timeline without posts from Celestials group', async () => {
            await like(celestialsPost.id, mars.authToken);
            await like(selenitesPost.id, mars.authToken);

            const homefeed = await fetchHomefeed(app, luna);
            expect(homefeed.timelines.posts, 'to have length', 1);
            expect(homefeed.timelines.posts[0], 'to equal', selenitesPost.id);
          });
        });
      });

      describe('Luna blocked Mars, their are both in group Selenites', () => {
        let mars;
        let venus;
        beforeEach(async () => {
          mars = await createUserAsync('mars', 'pw');
          venus = await createUserAsync('venus', 'pw');
          await createGroupAsync(venus, 'selenites');
          await subscribeToAsync(luna, { username: 'selenites' });
          await subscribeToAsync(mars, { username: 'selenites' });
          await banUser(mars, luna);
        });

        it('should return timeline without posts of Mars in Selenites group', async () => {
          await createAndReturnPostToFeed({ username: 'selenites' }, mars, 'Post');

          const homefeed = await fetchHomefeed(app, luna);
          expect(homefeed.posts, 'to be empty');
        });

        it('should return Mars timeline without posts of Luna in Selenites group', async () => {
          await createAndReturnPostToFeed({ username: 'selenites' }, luna, 'Post');

          const homefeed = await fetchHomefeed(app, mars);
          expect(homefeed.posts, 'to be empty');
        });
      });
    });
  });
});


const timelineSchema = {
  timelines: expect.it('to exhaustively satisfy', {
    id:          expect.it('to satisfy', schema.UUID),
    name:        expect.it('to be one of', ['RiverOfNews', 'Hides', 'Comments', 'Likes', 'Posts', 'Directs', 'MyDiscussions']),
    user:        expect.it('to satisfy', schema.UUID),
    posts:       expect.it('to be an array').and('to be empty').or('to have items satisfying', schema.UUID),
    subscribers: expect.it('to be an array').and('to be empty').or('to have items satisfying', schema.UUID),
  }),
  users:         expect.it('to be an array').and('to be empty').or('to have items satisfying', schema.user),
  posts:         expect.it('to be an array').and('to be empty').or('to have items satisfying', schema.post),
  comments:      expect.it('to be an array').and('to be empty').or('to have items satisfying', schema.comment),
  attachments:   expect.it('to be an array').and('to be empty').or('to have items satisfying', schema.attachment),
  subscribers:   expect.it('to be an array').and('to be empty').or('to have items satisfying', schema.userOrGroup),
  subscriptions: expect.it('to be an array').and('to be empty').or('to have items satisfying', {
    id:   expect.it('to satisfy', schema.UUID),
    name: expect.it('to be one of', ['Posts', 'Directs']),
    user: expect.it('to satisfy', schema.UUID),
  }),
};

async function fetchHomefeed(app, userContext) {
  const response = await fetch(
    `${app.context.config.host}/v2/timelines/home`,
    { headers: { 'X-Authentication-Token': userContext.authToken } }
  );
  const homefeed = await response.json();
  // console.log(homefeed);
  expect(response.status, 'to be', 200);
  expect(homefeed, 'to exhaustively satisfy', timelineSchema);
  return homefeed;
}
