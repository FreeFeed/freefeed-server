/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../../../dbCleaner';
import { Post, User, dbAdapter, Comment } from '../../../../app/models';


describe('Search', () => {
  const posts = [];
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

  describe('Luna, Mars and Venus wrote two post each in their feeds', () => {
    let luna, mars, venus;
    let lunaFeed, marsFeed, venusFeed;

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
            comment: 'all posts have "venus" in comments'
          },
          {
            query:   'mars venus',
            filter:  () => false,
            comment: 'none of posts have both this words in body or comment'
          },
          {
            query:   'mars | venus',
            comment: 'all posts have "venus" in comments'
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
          },
          {
            query:   'in-comment:venus -in-body:luna',
            filter:  (p) => p.userId !== luna.id,
            comment: `all posts (by "venus") expect the Luna's (by "luna")`
          }
        ]);

        describe('Luna bans Mars', () => {
          before(() => luna.ban(mars.username));
          after(() => luna.unban(mars.username));

          testSearch([
            {
              query:      'mars',
              viewerName: 'luna',
              filter:     () => false,
              comment:    'nothing from Mars'
            },
            {
              query:      'in-comments: luna',
              viewerName: 'mars',
              filter:     () => false,
              comment:    'Mars doesnt see Luna posts'
            },
            {
              query:      'in-comments: venus',
              viewerName: 'mars',
              filter:     (p) => p.userId !== luna.id,
            },
          ]);
        });
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

    describe('Search condition operators', () => {
      describe('"me" and "in-my:" checking', () => {
        it("should throw error if anonymous uses the 'me' username", async () => {
          const test = dbAdapter.search('from:me');
          await expect(test, 'to be rejected with', /sign in/);
        });

        it("should throw error if anonymous uses the 'in-my:' condition", async () => {
          const test = dbAdapter.search('in-my:saves');
          await expect(test, 'to be rejected with', /sign in/);
        });

        it('should not throw error if anonymous uses someone username', async () => {
          const test = dbAdapter.search('from:luna');
          await expect(test, 'to be fulfilled');
        });

        it("should not throw error if logged in user uses the 'me' username", async () => {
          const test = dbAdapter.search('from:me', { viewerId: luna.id });
          await expect(test, 'to be fulfilled');
        });

        it("should not throw error if logged in user uses the 'in-my:' condition", async () => {
          const test = dbAdapter.search('in-my:saves', { viewerId: luna.id });
          await expect(test, 'to be fulfilled');
        });

        it('should not throw error if logged in user uses someone username', async () => {
          const test = dbAdapter.search('from:luna', { viewerId: luna.id });
          await expect(test, 'to be fulfilled');
        });
      });

      describe('from:', () => {
        testSearch([
          {
            query:  'from:luna',
            filter: (p) => p.userId === luna.id
          },
          {
            query:      'from:me',
            viewerName: 'luna',
            filter:     (p) => p.userId === luna.id
          },
          {
            query:  'from:unknown',
            filter: () => false
          },
          {
            query:  'from:unknown,luna',
            filter: (p) => p.userId === luna.id
          },
          {
            query:  'from:mars from:luna',
            filter: () => false
          },
          {
            query:   'from:mars',
            filter:  () => true,
            comment: 'Mars commented everything'
          },
          {
            query:  'posts-from:mars',
            filter: (p) => p.userId === mars.id
          },
          {
            query:   'comments-from:mars',
            filter:  () => true,
            comment: 'Mars commented everything'
          },
          {
            query:  'comments-from:mars -posts-from:luna',
            filter: (p) => p.userId !== luna.id
          }
        ]);
      });
      describe('in:', () => {
        testSearch([
          {
            query:  'in:luna',
            filter: (p) => p.userId === luna.id
          },
          {
            query:  'commented-by:mars -in:luna',
            filter: (p) => p.userId !== luna.id
          },
          {
            query:  'commented-by:mars,unknown',
            filter: () => true
          },
          {
            query:  'posts-from:venus commented-by:mars',
            filter: (p) => p.userId === venus.id
          },
          {
            query:  'posts-from:venus -commented-by:mars',
            filter: () => false
          },
        ]);
        describe('Luna likes some post', () => {
          let likedPost;
          before(async () => {
            likedPost = posts[3]; // eslint-disable-line prefer-destructuring
            await likedPost.addLike(luna);
          });
          after(() => likedPost.removeLike(luna));

          testSearch([
            {
              query:  'commented-by:mars -liked-by:luna',
              filter: (p) => p.id !== likedPost.id
            },
            {
              query:  'liked-by:luna',
              filter: (p) => p.id === likedPost.id
            },
            {
              query:  'liked-by:luna,mars',
              filter: (p) => p.id === likedPost.id
            },
          ]);
        });
      });
    });
  });

  describe('Mentions, hashtags and links', () => {
    before(async () => {
      await cleanDB($pg_database);
      posts.length = 0;

      const luna = new User({ username: 'luna', password: 'pw' });
      await luna.create();
      const lunaFeed = await luna.getPostsTimeline();

      const newLunaPost = (body) =>
        new Post({ body, userId: luna.id, timelineIds: [lunaFeed.id] });

      posts.push(newLunaPost(`#first post mentions @luna`));
      posts.push(newLunaPost(`#second post mentions @mars`));
      posts.push(newLunaPost(`third post #mentions @mars and @luna`));
      posts.push(newLunaPost(`fourth post mentions @celestials`));
      posts.push(newLunaPost(`post about $3 fruits: apple.com`));
      posts.push(
        newLunaPost(
          `post that mentions https://get.adobe.com/ru/reader/ software`
        )
      );
      posts.push(
        newLunaPost(
          `complex stuff post https4_(%D0%BC%D0%B0%D1%82%D0%B5%D0%BC%D0%B0%D1%82%D0%B8%D0%BA%D0%B0) /cc @luna`
        )
      );
      posts.push(newLunaPost(`let me https://lmgtfy.com/?q=freefeed`));

      for (const post of posts) {
        await post.create(); // eslint-disable-line no-await-in-loop
      }

      // We will receive posts in reverse order
      posts.reverse();
    });

    testSearch([
      {
        query:  '@luna',
        filter: (p) => /@luna/.test(p.body)
      },
      {
        query:  'luna',
        filter: (p) => /@luna/.test(p.body)
      },
      {
        query:  '@luna @mars',
        filter: (p) => /@luna/.test(p.body) && /@mars/.test(p.body)
      },
      {
        query:  'mention @celestials',
        filter: (p) => /@celestials/.test(p.body)
      },
      {
        query:  'meNtIOn @CeleStials',
        filter: (p) => /@celestials/.test(p.body)
      },
      {
        query:  '"mention @celestials"',
        filter: (p) => /@celestials/.test(p.body)
      },
      {
        query:   '"@celestials mention"',
        filter:  () => false,
        comment: 'no post with such word order'
      },
      {
        query:   'mention @celestial',
        filter:  () => false,
        comment: 'mentions should be exact matched'
      },
      {
        query:  '#first',
        filter: (p) => /#first/.test(p.body)
      },
      {
        query:  '#mentions',
        filter: (p) => /#mentions/.test(p.body)
      },
      {
        query:   '#mention',
        filter:  () => false,
        comment: 'hashtag should be exact matched'
      },
      {
        query:  'apple.com',
        filter: (p) => /apple.com/.test(p.body)
      },
      {
        query:  'apple',
        filter: (p) => /apple.com/.test(p.body)
      },
      {
        query:  'com.apple',
        filter: () => false
      },
      {
        query:  'fruit apples',
        filter: (p) => /apple.com/.test(p.body)
      },
      {
        query:  'adobe.com',
        filter: (p) => /adobe.com/.test(p.body)
      },
      {
        query:  'adobe reader',
        filter: (p) => /adobe.com/.test(p.body)
      },
      {
        query:  'wikipedia',
        filter: (p) => /wikipedia/.test(p.body)
      },
      {
        query:  'wikipedia про математику',
        filter: (p) => /wikipedia/.test(p.body)
      },
      {
        query:  'freefeed',
        filter: (p) => /freefeed/.test(p.body)
      },
      {
        query:  'https://lmgtfy.com/?q=freefeed',
        filter: (p) => /freefeed/.test(p.body)
      }
    ]);
  });

  describe('Search query complexity', () => {
    it('should throw error if query is too complex', async () => {
      const test = dbAdapter.search(
        'The quick brown fox jumps over the lazy dog',
        { maxQueryComplexity: 5 }
      );
      await expect(test, 'to be rejected with', /too complex/);
    });
  });

  describe('Search condition operators', () => {
    let luna;
    before(async () => {
      await cleanDB($pg_database);

      luna = new User({ username: 'luna', password: 'pw' });
      await luna.create();
    });

    it("should throw error if anonymous uses the 'me' username", async () => {
      const test = dbAdapter.search('from:me');
      await expect(test, 'to be rejected with', /sign in/);
    });

    it('should not throw error if anonymous uses someone username', async () => {
      const test = dbAdapter.search('from:luna');
      await expect(test, 'to be fulfilled');
    });

    it("should not throw error if logged in user uses the 'me' username", async () => {
      const test = dbAdapter.search('from:me', { viewerId: luna.id });
      await expect(test, 'to be fulfilled');
    });

    it('should not throw error if logged in user uses someone username', async () => {
      const test = dbAdapter.search('from:luna', { viewerId: luna.id });
      await expect(test, 'to be fulfilled');
    });
  });
});
