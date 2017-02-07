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
          const resp = await fetchPost(lunaPost.id, null, true);
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
          const resp = await fetchPost(lunaPost.id, null, true);
          expect(resp, 'to satisfy', { status: 403 });
        });

        it('should return post to Luna', async () => {
          const post = await fetchPost(lunaPost.id, luna);
          expect(post.posts.id, 'to be', lunaPost.id);
        });

        it('should not return post to Venus', async () => {
          const resp = await fetchPost(lunaPost.id, venus, true);
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

const postFetcher = (app) => async (postId, viewerContext = null, returnError = false) => {
  const headers = {};
  if (viewerContext) {
    headers['X-Authentication-Token'] = viewerContext.authToken;
  }
  const response = await fetch(`${app.context.config.host}/v2/posts/${postId}`, { headers });
  const post = await response.json();
  if (response.status !== 200) {
    if (returnError) {
      return response;
    }
    expect.fail('HTTP error (code {0}): {1}', response.status, post.err);
  }
  expect(post, 'to exhaustively satisfy', postSchema);
  return post;
};
