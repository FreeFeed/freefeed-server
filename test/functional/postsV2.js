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
  createCommentAsync,
  like,
  goPrivate,
  goProtected,
  mutualSubscriptions,
} from './functional_test_helper'
import * as schema from './schemaV2-helper';

describe('TimelinesControllerV2', () => {
  let app;
  let fetchPost;

  before(async () => {
    app = await getSingleton();
    fetchPost = postFetcher(app);
    PubSub.setPublisher(new DummyPublisher());
  });

  beforeEach(async () => await knexCleaner.clean($pg_database));

  describe('#postsV2', () => {
    describe('Luna wrote post, Mars is mutual friend, Venus is stranger', () => {
      let luna, mars, venus;
      let lunaPost;
      beforeEach(async () => {
        [luna, mars, venus] = await Promise.all([
          createUserAsync('luna', 'pw'),
          createUserAsync('mars', 'pw'),
          createUserAsync('venus', 'pw'),
        ]);
        lunaPost = await createAndReturnPost(luna, 'Luna post');
        await mutualSubscriptions([luna, mars]);
      });

      describe('Comments folding test', () => {
        const expectFolding = async (nComments, expComments, expOmitted, allComments = false) => {
          for (let n = 0; n < nComments; n++) {
            await createCommentAsync(luna, lunaPost.id, `Comment ${n + 1}`);  // eslint-disable-line babel/no-await-in-loop
          }
          const post = await fetchPost(lunaPost.id, null, { allComments });
          expect(post.posts.comments, 'to have length', expComments);
          expect(post.posts.omittedComments, 'to equal', expOmitted);
        };

        describe('Folded comments', () => {
          it('shold return post whith 1 comment without folding', async () => await expectFolding(1, 1, 0));
          it('shold return post whith 2 comments without folding', async () => await expectFolding(2, 2, 0));
          it('shold return post whith 3 comments without folding', async () => await expectFolding(3, 3, 0));
          it('shold return post whith 4 comments with folding', async () => await expectFolding(4, 2, 2));
          it('shold return post whith 5 comments with folding', async () => await expectFolding(5, 2, 3));
        });

        describe('Unfolded comments', () => {
          it('shold return post whith 1 comment without folding', async () => await expectFolding(1, 1, 0, true));
          it('shold return post whith 2 comments without folding', async () => await expectFolding(2, 2, 0, true));
          it('shold return post whith 3 comments without folding', async () => await expectFolding(3, 3, 0, true));
          it('shold return post whith 4 comments without folding', async () => await expectFolding(4, 4, 0, true));
          it('shold return post whith 5 comments without folding', async () => await expectFolding(5, 5, 0, true));
        });
      });

      describe('Likes folding test', () => {
        let users;
        beforeEach(async () => {
          const promises = [];
          for (let n = 0; n < 5; n++) {
            promises.push(createUserAsync(`username${n + 1}`, 'pw'));
          }
          users = await Promise.all(promises);
        });

        const expectFolding = async (nLikes, expLikes, expOmitted, allLikes = false) => {
          await Promise.all(users.slice(0, nLikes).map((u) => like(lunaPost.id, u.authToken)));
          const post = await fetchPost(lunaPost.id, null, { allLikes });
          expect(post.posts.likes, 'to have length', expLikes);
          expect(post.posts.omittedLikes, 'to equal', expOmitted);
        };

        describe('Folded likes', () => {
          it('shold return post whith 1 like without folding', async () => await expectFolding(1, 1, 0));
          it('shold return post whith 2 likes without folding', async () => await expectFolding(2, 2, 0));
          it('shold return post whith 3 likes without folding', async () => await expectFolding(3, 3, 0));
          it('shold return post whith 4 likes without folding', async () => await expectFolding(4, 4, 0));
          it('shold return post whith 5 likes with folding', async () => await expectFolding(5, 3, 2));
        });

        describe('Unfolded likes', () => {
          it('shold return post whith 1 like without folding', async () => await expectFolding(1, 1, 0, true));
          it('shold return post whith 2 likes without folding', async () => await expectFolding(2, 2, 0, true));
          it('shold return post whith 3 likes without folding', async () => await expectFolding(3, 3, 0, true));
          it('shold return post whith 4 likes without folding', async () => await expectFolding(4, 4, 0, true));
          it('shold return post whith 5 likes without folding', async () => await expectFolding(5, 5, 0, true));
        });
      });

      describe('Luna is a public user', () => {
        it('should return post to anonymous', async () => {
          const post = await fetchPost(lunaPost.id);
          expect(post.posts.id, 'to be', lunaPost.id);
        });

        it('should return post to Luna', async () => {
          const post = await fetchPost(lunaPost.id, luna);
          expect(post.posts.id, 'to be', lunaPost.id);
        });

        it('should return post to Venus', async () => {
          const post = await fetchPost(lunaPost.id, venus);
          expect(post.posts.id, 'to be', lunaPost.id);
        });
      });

      describe('Luna is a protected user', () => {
        beforeEach(async () => await goProtected(luna));

        it('should not return post to anonymous', async () => {
          const resp = await fetchPost(lunaPost.id, null, { returnError: true });
          expect(resp, 'to satisfy', { status: 403 });
        });

        it('should return post to Luna', async () => {
          const post = await fetchPost(lunaPost.id, luna);
          expect(post.posts.id, 'to be', lunaPost.id);
        });

        it('should return post to Venus', async () => {
          const post = await fetchPost(lunaPost.id, venus);
          expect(post.posts.id, 'to be', lunaPost.id);
        });
      });

      describe('Luna is a private user', () => {
        beforeEach(async () => await goPrivate(luna));

        it('should not return post to anonymous', async () => {
          const resp = await fetchPost(lunaPost.id, null, { returnError: true });
          expect(resp, 'to satisfy', { status: 403 });
        });

        it('should return post to Luna', async () => {
          const post = await fetchPost(lunaPost.id, luna);
          expect(post.posts.id, 'to be', lunaPost.id);
        });

        it('should not return post to Venus', async () => {
          const resp = await fetchPost(lunaPost.id, venus, { returnError: true });
          expect(resp, 'to satisfy', { status: 403 });
        });

        it('should return post to Mars', async () => {
          const post = await fetchPost(lunaPost.id, mars);
          expect(post.posts.id, 'to be', lunaPost.id);
        });
      });
    });
  });
});

const postSchema = {
  posts:         expect.it('to satisfy', schema.post),
  users:         expect.it('to be an array').and('to be empty').or('to have items satisfying', schema.user),
  comments:      expect.it('to be an array').and('to be empty').or('to have items satisfying', schema.comment),
  attachments:   expect.it('to be an array').and('to be empty').or('to have items satisfying', schema.attachment),
  subscribers:   expect.it('to be an array').and('to be empty').or('to have items satisfying', schema.userOrGroup),
  subscriptions: expect.it('to be an array').and('to be empty').or('to have items satisfying', {
    id:   expect.it('to satisfy', schema.UUID),
    name: expect.it('to be one of', ['Posts', 'Directs']),
    user: expect.it('to satisfy', schema.UUID),
  }),
};

const postFetcher = (app) => async (postId, viewerContext = null, params = {}) => {
  params = {
    viewer:      null,
    returnError: false,
    allComments: false,
    allLikes:    false,
    ...params,
  };
  const headers = {};
  if (viewerContext) {
    headers['X-Authentication-Token'] = viewerContext.authToken;
  }
  const response = await fetch(
    `${app.context.config.host}/v2/posts/${postId}?maxComments=${params.allComments ? 'all' : ''}&maxLikes=${params.allLikes ? 'all' : ''}`,
    { headers }
  );
  const post = await response.json();
  if (response.status !== 200) {
    if (params.returnError) {
      return response;
    }
    expect.fail('HTTP error (code {0}): {1}', response.status, post.err);
  }
  expect(post, 'to exhaustively satisfy', postSchema);
  return post;
};
