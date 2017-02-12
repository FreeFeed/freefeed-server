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
  goProtected,
  sendRequestToSubscribe,
  acceptRequestToSubscribe,
  hidePost,
  createGroupAsync,
  createAndReturnPostToFeed,
  mutualSubscriptions,
} from './functional_test_helper'
import * as schema from './schemaV2-helper';

describe('TimelinesControllerV2', () => {
  let app;

  before(async () => {
    app = await getSingleton();
    PubSub.setPublisher(new DummyPublisher());
  });

  beforeEach(async () => await knexCleaner.clean($pg_database));

  describe('#home', () => {
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

      it('should return timeline with one private viewer\'s post', async () => {
        await goPrivate(luna);
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

        it('should return timeline without comment and like of banned user', async () => {
          const post = await createAndReturnPost(mars, 'Mars post');
          await banUser(luna, venus);
          await createCommentAsync(venus, post.id, 'Comment');
          await like(post.id, venus.authToken);

          const homefeed = await fetchHomefeed(app, luna);
          expect(homefeed.posts, 'to have length', 1);
          expect(homefeed.posts[0].comments, 'to be empty');
          expect(homefeed.posts[0].likes, 'to be empty');
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

        describe('Luna have a private feed', () => {
          beforeEach(async () => {
            await goPrivate(luna);
          });

          it('should return timeline with her own post', async () => {
            const post = await createAndReturnPost(luna, 'Luna post');

            const homefeed = await fetchHomefeed(app, luna);
            expect(homefeed.timelines.posts, 'to have length', 1);
            expect(homefeed.timelines.posts[0], 'to be', post.id);
          });

          it('should return timeline with post liked by Luna', async () => {
            const post = await createAndReturnPost(venus, 'Venus post');
            await like(post.id, luna.authToken);

            const homefeed = await fetchHomefeed(app, luna);
            expect(homefeed.timelines.posts, 'to have length', 1);
            expect(homefeed.timelines.posts[0], 'to be', post.id);
          });

          it('should return timeline with post commented by Luna', async () => {
            const post = await createAndReturnPost(venus, 'Venus post');
            await createCommentAsync(luna, post.id, 'Comment');

            const homefeed = await fetchHomefeed(app, luna);
            expect(homefeed.timelines.posts, 'to have length', 1);
            expect(homefeed.timelines.posts[0], 'to be', post.id);
          });
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


  describe('#discussions', () => {
    it('should reject unauthenticated users', async () => {
      const response = await fetch(`${app.context.config.host}/v2/timelines/filter/discussions`);
      expect(response, 'to satisfy', { status: 401 });
      const data = await response.json();
      expect(data, 'to have key', 'err');
    });

    describe('Viewer Luna', () => {
      let luna, mars;
      let marsPostLikedByLuna,
        marsPostCommentedByLuna,
        lunaPost;
      beforeEach(async () => {
        luna = await createUserAsync('luna', 'pw');
        mars = await createUserAsync('mars', 'pw');
        marsPostLikedByLuna = await createAndReturnPost(mars, 'Mars post 1');
        marsPostCommentedByLuna = await createAndReturnPost(mars, 'Mars post 2');
        lunaPost = await createAndReturnPost(luna, 'Luna post');
        await createCommentAsync(luna, marsPostCommentedByLuna.id, 'Comment');
        await like(marsPostLikedByLuna.id, luna.authToken);
      });

      it('should return timeline with posts commented or liked by Luna', async () => {
        const feed = await fetchMyDiscussions(app, luna);
        expect(feed.timelines.posts, 'to equal', [
          marsPostCommentedByLuna.id,
          marsPostLikedByLuna.id,
        ]);
      });

      it('should return timeline with posts authored, commented or liked by Luna', async () => {
        const feed = await fetchMyDiscussionsWithMyPosts(app, luna);
        expect(feed.timelines.posts, 'to equal', [
          marsPostCommentedByLuna.id,
          lunaPost.id,
          marsPostLikedByLuna.id,
        ]);
      });

      describe('Mars going private', () => {
        beforeEach(async () => {
          await goPrivate(mars);
        });

        it('should return timeline without private posts commented or liked by Luna', async () => {
          const feed = await fetchMyDiscussions(app, luna);
          expect(feed.timelines.posts, 'to be empty');
        });

        it('should return timeline with posts authored by Luna', async () => {
          const feed = await fetchMyDiscussionsWithMyPosts(app, luna);
          expect(feed.timelines.posts, 'to equal', [
            lunaPost.id,
          ]);
        });
      });
    });
  });

  describe('#directs', () => {
    it('should reject unauthenticated users', async () => {
      const response = await fetch(`${app.context.config.host}/v2/timelines/filter/directs`);
      expect(response, 'to satisfy', { status: 401 });
      const data = await response.json();
      expect(data, 'to have key', 'err');
    });

    describe('Luna is a friend of Mars', () => {
      let luna, mars;
      let postLunaToMars, postMarsToLuna;
      beforeEach(async () => {
        luna = await createUserAsync('luna', 'pw');
        mars = await createUserAsync('mars', 'pw');
        await mutualSubscriptions([luna, mars]);
        postLunaToMars = await createAndReturnPostToFeed({ username: 'mars' }, luna, 'Post');
        postMarsToLuna = await createAndReturnPostToFeed({ username: 'luna' }, mars, 'Post');
      });

      it('should return timeline with directs from Luna and to Luna', async () => {
        const feed = await fetchDirects(app, luna);
        expect(feed.timelines.posts, 'to have length', 2);
        expect(feed.timelines.posts[0], 'to equal', postMarsToLuna.id);
        expect(feed.timelines.posts[1], 'to equal', postLunaToMars.id);
      });

      describe('Mars blocked Luna', () => {
        beforeEach(async () => {
          await banUser(luna, mars);
        });

        it('should return timeline without posts from banned user', async () => {
          const feed = await fetchDirects(app, luna);
          expect(feed.timelines.posts, 'to have length', 1);
          expect(feed.timelines.posts[0], 'to equal', postLunaToMars.id);
        });
      });
    });
  });

  describe('#user\'s timelines', () => {
    let luna, mars, venus;
    let postCreatedByMars, postCommentedByMars, postLikedByMars;
    beforeEach(async () => {
      [luna, mars, venus] = await Promise.all([
        createUserAsync('luna', 'pw'),
        createUserAsync('mars', 'pw'),
        createUserAsync('venus', 'pw'),
      ]);
      await subscribeToAsync(venus, mars);
      postCreatedByMars = await createAndReturnPost(mars, 'Post');
      postCommentedByMars = await createAndReturnPost(venus, 'Post');
      postLikedByMars = await createAndReturnPost(venus, 'Post');
      await createCommentAsync(mars, postCommentedByMars.id, 'Comment');
      await like(postLikedByMars.id, mars.authToken);
    });

    const nonEmptyExpected = (anonymous = true) => async () => {
      const viewer = anonymous ? null : luna;
      {
        const feed = await fetchUserTimeline('Posts', mars, app, viewer);
        expect(feed.timelines.posts, 'to have length', 1);
        expect(feed.timelines.posts[0], 'to equal', postCreatedByMars.id);
        expect(feed.timelines.subscribers, 'to be non-empty');
        expect(feed.timelines.subscribers, 'to contain', venus.user.id);
      }
      {
        const feed = await fetchUserTimeline('Comments', mars, app, viewer);
        expect(feed.timelines.posts, 'to have length', 1);
        expect(feed.timelines.posts[0], 'to equal', postCommentedByMars.id);
      }
      {
        const feed = await fetchUserTimeline('Likes', mars, app, viewer);
        expect(feed.timelines.posts, 'to have length', 1);
        expect(feed.timelines.posts[0], 'to equal', postLikedByMars.id);
      }
    };

    const emptyExpected = (anonymous = true) => async () => {
      const viewer = anonymous ? null : luna;
      {
        const feed = await fetchUserTimeline('Posts', mars, app, viewer);
        expect(feed.timelines.posts, 'to be empty');
        expect(feed.timelines.subscribers, 'to be empty');
      }
      {
        const feed = await fetchUserTimeline('Comments', mars, app, viewer);
        expect(feed.timelines.posts, 'to be empty');
      }
      {
        const feed = await fetchUserTimeline('Likes', mars, app, viewer);
        expect(feed.timelines.posts, 'to be empty');
      }
    };

    describe('Mars is a public user', () => {
      it('should return Mars timelines with posts to anonymous', nonEmptyExpected());
      it('should return Mars timelines with posts to Luna', nonEmptyExpected(false));
    });

    describe('Mars is a private user', () => {
      beforeEach(async () => {
        await goPrivate(mars);
      });
      it('should return Mars timelines without posts to anonymous', emptyExpected());
      it('should return Mars timelines without posts to Luna', emptyExpected(false));
    });

    describe('Mars is a protected user', () => {
      beforeEach(async () => {
        await goProtected(mars);
      });
      it('should return Mars timelines without posts to anonymous', emptyExpected());
      it('should return Mars timelines with posts to Luna', nonEmptyExpected(false));
    });

    describe('Mars is a private user and Luna subscribed to him', () => {
      beforeEach(async () => {
        await goPrivate(mars);
        await sendRequestToSubscribe(luna, mars);
        await acceptRequestToSubscribe(luna, mars);
      });
      it('should return Mars timelines with posts to Luna', nonEmptyExpected(false));
    });

    describe('Mars is a public user but bans Luna', () => {
      beforeEach(async () => {
        await banUser(mars, luna);
      });
      it('should return Mars timelines without posts to Luna', emptyExpected(false));
    });

    describe('Mars is a public user but was banned by Luna', () => {
      beforeEach(async () => {
        await banUser(luna, mars);
      });
      it('should return Mars timelines without posts to Luna', emptyExpected(false));
    });
  });

  describe('#pagination', () => {
    let luna;
    beforeEach(async () => {
      luna = await createUserAsync('luna', 'pw');
      // Luna creates 10 posts
      for (let i = 0; i < 10; i++) {
        await createAndReturnPost(luna, 'Post');  // eslint-disable-line babel/no-await-in-loop
      }
    });

    it('should return first page with isLastPage = false', async () => {
      const timeline = await fetchTimeline('luna?limit=5&offset=0')(app);
      expect(timeline.isLastPage, 'to equal', false);
    });

    it('should return last page with isLastPage = true', async () => {
      const timeline = await fetchTimeline('luna?limit=5&offset=5')(app);
      expect(timeline.isLastPage, 'to equal', true);
    });

    it('should return the only page with isLastPage = true', async () => {
      const timeline = await fetchTimeline('luna?limit=15&offset=0')(app);
      expect(timeline.isLastPage, 'to equal', true);
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
  admins:        expect.it('to be an array').and('to be empty').or('to have items satisfying', schema.user),
  posts:         expect.it('to be an array').and('to be empty').or('to have items satisfying', schema.post),
  comments:      expect.it('to be an array').and('to be empty').or('to have items satisfying', schema.comment),
  attachments:   expect.it('to be an array').and('to be empty').or('to have items satisfying', schema.attachment),
  subscribers:   expect.it('to be an array').and('to be empty').or('to have items satisfying', schema.userOrGroup),
  subscriptions: expect.it('to be an array').and('to be empty').or('to have items satisfying', {
    id:   expect.it('to satisfy', schema.UUID),
    name: expect.it('to be one of', ['Posts', 'Directs']),
    user: expect.it('to satisfy', schema.UUID),
  }),
  isLastPage: expect.it('to be a boolean'),
};

const fetchTimeline = (path) => async (app, viewerContext = null) => {
  const headers = {};
  if (viewerContext) {
    headers['X-Authentication-Token'] = viewerContext.authToken;
  }
  const response = await fetch(`${app.context.config.host}/v2/timelines/${path}`, { headers });
  const feed = await response.json();
  // console.log(feed);
  if (response.status !== 200) {
    expect.fail('HTTP error (code {0}): {1}', response.status, feed.err);
  }
  expect(feed, 'to exhaustively satisfy', timelineSchema);
  return feed;
};

const fetchHomefeed = fetchTimeline('home');
const fetchMyDiscussions = fetchTimeline('filter/discussions');
const fetchMyDiscussionsWithMyPosts = fetchTimeline('filter/discussions?with-my-posts=yes');
const fetchDirects = fetchTimeline('filter/directs');

const fetchUserTimeline = async (name, userContext, app, viewerContext = null) => {
  let path = userContext.username;
  if (name === 'Comments') {
    path = `${path}/comments`;
  }
  if (name === 'Likes') {
    path = `${path}/likes`;
  }
  return await fetchTimeline(path)(app, viewerContext);
};
