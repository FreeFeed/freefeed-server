/* eslint-env node, mocha */
/* global $pg_database */
import knexCleaner from 'knex-cleaner'
import expect from 'unexpected'
import { dbAdapter, User, Group } from '../../app/models'

describe('Post Privacy Flags', () => {
  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  describe('User Luna is a member of public group Selenites and private group Celestials', () => {
    let luna,
      selenites, celestials,
      lunaTimeline, selenitesTimeline, celestialsTimeline;
    beforeEach(async () => {
      luna = new User({ username: 'luna', password: 'pw' });
      selenites = new Group({ username: 'selenites' });
      celestials = new Group({ username: 'celestials' });
      await luna.create();
      await Promise.all([
        selenites.create(luna.id),
        celestials.create(luna.id),
      ]);
      [
        lunaTimeline,
        selenitesTimeline,
        celestialsTimeline,
      ] = await Promise.all([
        luna.getPostsTimeline(),
        selenites.getPostsTimeline(),
        celestials.getPostsTimeline(),
      ]);
      await celestials.update({ isPrivate: '1', isProtected: '1' });
    })

    it('should create a public post in own feed', async () => {
      const post = await createPost(luna, { body: 'Post body' });
      expect(post.isPrivate, 'to equal', '0');
      expect(post.isProtected, 'to equal', '0');
    });

    it('should create a public post in Selenites', async () => {
      const post = await createPost(luna, { body: 'Post body', timelineIds: [selenitesTimeline.id] });
      expect(post.isPrivate, 'to equal', '0');
      expect(post.isProtected, 'to equal', '0');
    });

    it('should create a private post in Celestials', async () => {
      const post = await createPost(luna, { body: 'Post body', timelineIds: [celestialsTimeline.id] });
      expect(post.isPrivate, 'to equal', '1');
      expect(post.isProtected, 'to equal', '1');
    });

    it('should create a public post in Celestials and Selenites', async () => {
      const post = await createPost(luna, { body: 'Post body', timelineIds: [celestialsTimeline.id, selenitesTimeline.id] });
      expect(post.isPrivate, 'to equal', '0');
      expect(post.isProtected, 'to equal', '0');
    });

    describe('Posts in Luna feed, Luna+Selenites and Luna+Celestials', () => {
      let postToLuna, postToSelenitesAndLuna, postToCelestialsAndLuna;
      beforeEach(async () => {
        [
          postToLuna,
          postToSelenitesAndLuna,
          postToCelestialsAndLuna,
        ] = await Promise.all([
          createPost(luna, { body: 'Post body', timelineIds: [lunaTimeline.id] }),
          createPost(luna, { body: 'Post body', timelineIds: [lunaTimeline.id, selenitesTimeline.id] }),
          createPost(luna, { body: 'Post body', timelineIds: [lunaTimeline.id, celestialsTimeline.id] }),
        ]);
      });

      it('all posts should be public', async () => {
        expect(postToLuna.isPrivate, 'to equal', '0');
        expect(postToLuna.isProtected, 'to equal', '0');
        expect(postToSelenitesAndLuna.isPrivate, 'to equal', '0');
        expect(postToSelenitesAndLuna.isProtected, 'to equal', '0');
        expect(postToCelestialsAndLuna.isPrivate, 'to equal', '0');
        expect(postToCelestialsAndLuna.isProtected, 'to equal', '0');
      });

      describe('when Luna goes protected', () => {
        beforeEach(async () => {
          await luna.update({ isPrivate: '0', isProtected: '1' });
          [
            postToLuna,
            postToSelenitesAndLuna,
            postToCelestialsAndLuna,
          ] = await Promise.all([
            dbAdapter.getPostById(postToLuna.id),
            dbAdapter.getPostById(postToSelenitesAndLuna.id),
            dbAdapter.getPostById(postToCelestialsAndLuna.id),
          ]);
        });

        it('posts should change privacy', async () => {
          expect(postToLuna.isPrivate, 'to equal', '0');
          expect(postToLuna.isProtected, 'to equal', '1');
          expect(postToSelenitesAndLuna.isPrivate, 'to equal', '0');
          expect(postToSelenitesAndLuna.isProtected, 'to equal', '0');
          expect(postToCelestialsAndLuna.isPrivate, 'to equal', '0');
          expect(postToCelestialsAndLuna.isProtected, 'to equal', '1');
        });
      });

      describe('when Luna goes private', () => {
        beforeEach(async () => {
          await luna.update({ isPrivate: '1', isProtected: '1' });
          [
            postToLuna,
            postToSelenitesAndLuna,
            postToCelestialsAndLuna,
          ] = await Promise.all([
            dbAdapter.getPostById(postToLuna.id),
            dbAdapter.getPostById(postToSelenitesAndLuna.id),
            dbAdapter.getPostById(postToCelestialsAndLuna.id),
          ]);
        });

        it('posts should change privacy', async () => {
          expect(postToLuna.isPrivate, 'to equal', '1');
          expect(postToLuna.isProtected, 'to equal', '1');
          expect(postToSelenitesAndLuna.isPrivate, 'to equal', '0');
          expect(postToSelenitesAndLuna.isProtected, 'to equal', '0');
          expect(postToCelestialsAndLuna.isPrivate, 'to equal', '1');
          expect(postToCelestialsAndLuna.isProtected, 'to equal', '1');
        });
      });

      describe('when Luna goes private and returns back', () => {
        beforeEach(async () => {
          await luna.update({ isPrivate: '1', isProtected: '1' });
          await luna.update({ isPrivate: '0', isProtected: '0' });
          [
            postToLuna,
            postToSelenitesAndLuna,
            postToCelestialsAndLuna,
          ] = await Promise.all([
            dbAdapter.getPostById(postToLuna.id),
            dbAdapter.getPostById(postToSelenitesAndLuna.id),
            dbAdapter.getPostById(postToCelestialsAndLuna.id),
          ]);
        });

        it('all posts should became public', async () => {
          expect(postToLuna.isPrivate, 'to equal', '0');
          expect(postToLuna.isProtected, 'to equal', '0');
          expect(postToSelenitesAndLuna.isPrivate, 'to equal', '0');
          expect(postToSelenitesAndLuna.isProtected, 'to equal', '0');
          expect(postToCelestialsAndLuna.isPrivate, 'to equal', '0');
          expect(postToCelestialsAndLuna.isProtected, 'to equal', '0');
        });
      });
    });
  });
});

async function createPost(author, postData) {
  const post = await author.newPost(postData);
  await post.create();
  return post;
}
