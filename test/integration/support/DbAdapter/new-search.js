/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../../../dbCleaner';
import { Post, User, dbAdapter, Comment } from '../../../../app/models';


describe('Search', () => {
  describe('Luna, Mars and Venus wrote two post each in their feeds', () => {
    let luna, mars, venus;
    let lunaFeed, marsFeed, venusFeed;
    const posts = [];

    before(async () => {
      await cleanDB($pg_database);

      luna = new User({ username: 'luna', password: 'pw' });
      mars = new User({ username: 'mars', password: 'pw' });
      venus = new User({ username: 'venus', password: 'pw' });
      await Promise.all([luna.create(), mars.create(), venus.create()]);

      [lunaFeed, marsFeed, venusFeed] = await Promise.all([
        luna.getPostsTimeline(),
        mars.getPostsTimeline(),
        venus.getPostsTimeline()
      ]);

      for (let i = 0; i < 2; i++) {
        posts.push(
          new Post({
            body:        `luna ${i ? 'second post' : 'post first'}`,
            userId:      luna.id,
            timelineIds: [lunaFeed.id]
          })
        );
        posts.push(
          new Post({
            body:        `mars ${i ? 'second post' : 'post first'}`,
            userId:      mars.id,
            timelineIds: [marsFeed.id]
          })
        );
        posts.push(
          new Post({
            body:        `venus ${i ? 'second post' : 'post first'}`,
            userId:      venus.id,
            timelineIds: [venusFeed.id]
          })
        );
      }

      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        await post.create(); // eslint-disable-line no-await-in-loop

        const comment1 = new Comment({
          body: `Mars comment to post ${i + 1} ${
            post.userId === luna.id ? 'from Luna' : ''
          }`,
          userId: mars.id,
          postId: post.id
        });
        const comment2 = new Comment({
          body: `Venus comment to post ${i + 1} ${
            post.userId === luna.id ? 'from Luna' : ''
          }`,
          userId: venus.id,
          postId: post.id
        });
        await comment1.create(); // eslint-disable-line no-await-in-loop
        await comment2.create(); // eslint-disable-line no-await-in-loop
      }

      // We will receive posts in reverse order
      posts.reverse();
    });
    after(() => Promise.all(posts.map((post) => post.destroy())));

    function testSearch(testData) {
      for (const {
        query = '',
        viewerName = null,
        filter = () => true,
        comment = ''
      } of testData) {
        const description = [
          `should search by`,
          query ? `'${query}'` : 'empty',
          `query`,
          viewerName && `as ${viewerName}`,
          comment && `(${comment})`
        ]
          .filter(Boolean)
          .join(' ');
        it(description, async () => {
          const viewer = viewerName
            ? await dbAdapter.getUserByUsername(viewerName)
            : null;
          const postIds = await dbAdapter.search(query, { viewerId: viewer ? viewer.id : undefined });
          const expected = posts.filter(filter).map((p) => p.id);
          expect(postIds, 'to equal', expected);
        });
      }
    }

    describe('General text search', () => {
      testSearch([
        {
          query:   '',
          comment: 'all posts'
        },
        {
          query:  'first',
          filter: (p) => /first/.test(p.body)
        },
        {
          query:  'first | luna',
          filter: (p) => /first/.test(p.body) || /luna/.test(p.body)
        },
        {
          query:  'first luna | mars',
          filter: (p) =>
            /first/.test(p.body) && (/luna/.test(p.body) || /mars/.test(p.body))
        },
        {
          query:   '"luna post"',
          filter:  (p) => /luna post/.test(p.body),
          comment: 'by phrase'
        }
      ]);

      describe('Scoped (in posts and comments bodies) search', () => {
        testSearch([
          {
            query:   'venus',
            comment: 'all posts have this comment'
          },
          {
            query:   'mars venus',
            filter:  () => false,
            comment: 'none of posts have both this words in body or comment'
          },
          {
            query:  'in-body:venus',
            filter: (p) => p.userId === venus.id
          },
          {
            query:  'in-comment: luna',
            filter: (p) => p.userId === luna.id
          },
          {
            query:  'in-comment: venus -luna',
            filter: (p) => p.userId !== luna.id
          }
        ]);
      });
    });

    describe('Luna is public, Mars is protected, Venus is private', () => {
      before(async () => {
        await Promise.all([
          mars.update({ isProtected: '1' }),
          venus.update({ isPrivate: '1' })
        ]);

        // Update posts data
        const newPosts = await dbAdapter.getPostsByIds(posts.map((p) => p.id));
        posts.length = 0;
        posts.push(...newPosts);
      });

      after(() =>
        Promise.all([
          mars.update({ isProtected: '0', isPrivate: '0' }),
          venus.update({ isProtected: '0', isPrivate: '0' })
        ])
      );

      describe('empty search string (find all available posts)', () => {
        testSearch([
          {
            filter:  (p) => p.isProtected === '0',
            comment: 'public posts for anonymous'
          },
          {
            viewerName: 'luna',
            filter:     (p) => p.isPrivate === '0',
            comment:    'public and protected posts'
          },
          {
            viewerName: 'venus',
            filter:     () => true,
            comment:    'all posts'
          }
        ]);

        describe('Luna bans Mars', () => {
          before(() => luna.ban(mars.username));
          after(() => luna.unban(mars.username));

          testSearch([
            {
              filter:  (p) => p.isProtected === '0',
              comment: 'public posts for anonymous'
            },
            {
              viewerName: 'luna',
              filter:     (p) => p.userId === luna.id,
              comment:    "Luna's posts only"
            },
            {
              viewerName: 'mars',
              filter:     (p) => p.userId === mars.id,
              comment:    "Mars' posts only"
            },
            {
              viewerName: 'venus',
              comment:    'all posts'
            }
          ]);
        });
      });
    });
  });
});
