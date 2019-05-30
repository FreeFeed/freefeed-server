/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected'

import cleanDB from '../dbCleaner';

import * as schema from './schemaV2-helper';
import { performRequest, createTestUsers, createAndReturnPost, goProtected, goPrivate, unbanUser, banUser } from './functional_test_helper';


describe('TimelinesControllerV2: Everything', () => {
  // Luna is public, Mars is protected, Venus is private
  let luna, mars, venus;
  const posts = [];
  before(async () => {
    await cleanDB($pg_database);

    ([luna, mars, venus] = await createTestUsers(3));
    await goProtected(mars);
    await goPrivate(venus);

    // Luna, Mars and Venus wrote two post each in their feeds
    for (let i = 0; i < 2; i++) {
      posts.push(await createAndReturnPost(luna, 'Post')); // eslint-disable-line no-await-in-loop
      posts.push(await createAndReturnPost(mars, 'Post')); // eslint-disable-line no-await-in-loop
      posts.push(await createAndReturnPost(venus, 'Post')); // eslint-disable-line no-await-in-loop
    }

    // We will receive posts in reverse order
    posts.reverse();
  });

  it('should return public posts to anonymous viewer', async () => {
    const resp = await fetchEverything(null);
    const publicPosts = posts.filter((p) => p.createdBy === luna.user.id);
    expect(resp.posts, 'to equal', publicPosts);
  });

  it('should return public and protected posts to Luna', async () => {
    const resp = await fetchEverything(luna);
    const nonPrivatePosts = posts.filter((p) => p.createdBy === luna.user.id || p.createdBy === mars.user.id);
    expect(resp.posts, 'to equal', nonPrivatePosts);
  });

  it('should return all posts to Venus', async () => {
    const resp = await fetchEverything(venus);
    expect(resp.posts, 'to equal', posts);
  });

  describe('Luna bans Mars', () => {
    before(() => banUser(luna, mars));
    after(() => unbanUser(luna, mars));

    it('should return public posts to anonymous viewer', async () => {
      const resp = await fetchEverything(null);
      const publicPosts = posts.filter((p) => p.createdBy === luna.user.id);
      expect(resp.posts, 'to equal', publicPosts);
    });

    it('should return Luna posts to Luna', async () => {
      const resp = await fetchEverything(luna);
      const nonPrivatePosts = posts.filter((p) => p.createdBy === luna.user.id);
      expect(resp.posts, 'to equal', nonPrivatePosts);
    });

    it('should return Mars posts to Mars', async () => {
      const resp = await fetchEverything(mars);
      const nonPrivatePosts = posts.filter((p) => p.createdBy === mars.user.id);
      expect(resp.posts, 'to equal', nonPrivatePosts);
    });

    it('should return all posts to Venus', async () => {
      const resp = await fetchEverything(venus);
      expect(resp.posts, 'to equal', posts);
    });
  });
});

async function fetchEverything(viewerContext = null) {
  const headers = {};

  if (viewerContext) {
    headers['X-Authentication-Token'] = viewerContext.authToken;
  }

  const response = await performRequest(`/v2/everything`, {  headers });
  const feed = await response.json();

  // console.log(feed);
  if (response.status !== 200) {
    expect.fail('HTTP error (code {0}): {1}', response.status, feed.err);
  }

  expect(feed, 'to exhaustively satisfy', schema.everythingResponse);
  return feed;
}
