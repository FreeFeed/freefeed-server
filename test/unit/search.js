/* eslint-env node, mocha */
/* global $pg_database */
import knexCleaner from 'knex-cleaner'
import { User, dbAdapter } from '../../app/models'
import { SearchQueryParser } from '../../app/support/SearchQueryParser'


describe('FullTextSearch', () => {
  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  describe('public users Luna, Mars', () => {
    const lunaPostsContent = ['Able', 'Baker', 'Charlie', 'Dog']

    let luna
      , mars
      , lunaPosts
      , lunaVisibleFeedIds
      , bannedByLunaUserIds
      , marsVisibleFeedIds
      , bannedByMarsUserIds

    beforeEach(async () => {
      luna    = new User({ username: 'Luna', password: 'password' })
      mars    = new User({ username: 'Mars', password: 'password' })

      await Promise.all([luna.create(), mars.create()]);

      lunaVisibleFeedIds = (await dbAdapter.getUserById(luna.id)).subscribedFeedIds
      bannedByLunaUserIds = await luna.getBanIds()

      marsVisibleFeedIds = (await dbAdapter.getUserById(mars.id)).subscribedFeedIds
      bannedByMarsUserIds = await mars.getBanIds()

      lunaPosts = []
      for (const body of lunaPostsContent) {
        const post = await luna.newPost({ body })  // eslint-disable-line babel/no-await-in-loop
        lunaPosts.push(await post.create())  // eslint-disable-line babel/no-await-in-loop
      }
    })

    describe('Luna and Mars are not friends', () => {
      it("Mars can find Luna's posts", async () => {
        const query = SearchQueryParser.parse('baker')

        const searchResults = await dbAdapter.searchPosts(query, mars.id, marsVisibleFeedIds, bannedByMarsUserIds, 0, 30)
        searchResults.should.not.be.empty
        searchResults.length.should.eql(1)
        searchResults[0].should.have.property('uid')
        searchResults[0].uid.should.eql(lunaPosts[1].id)
        searchResults[0].should.have.property('body')
        searchResults[0].body.should.eql(lunaPosts[1].body)
      })

      it('Luna can find own posts', async () => {
        const query = SearchQueryParser.parse('baker')

        const searchResults = await dbAdapter.searchPosts(query, luna.id, lunaVisibleFeedIds, bannedByLunaUserIds, 0, 30)
        searchResults.should.not.be.empty
        searchResults.length.should.eql(1)
        searchResults[0].should.have.property('uid')
        searchResults[0].uid.should.eql(lunaPosts[1].id)
        searchResults[0].should.have.property('body')
        searchResults[0].body.should.eql(lunaPosts[1].body)
      })

      it("Mars can find Luna's posts in 'luna' scope", async () => {
        const query = SearchQueryParser.parse('baker from:luna')

        const searchResults = await dbAdapter.searchUserPosts(query, luna.id, marsVisibleFeedIds, bannedByMarsUserIds, 0, 30)
        searchResults.should.not.be.empty
        searchResults.length.should.eql(1)
        searchResults[0].should.have.property('uid')
        searchResults[0].uid.should.eql(lunaPosts[1].id)
        searchResults[0].should.have.property('body')
        searchResults[0].body.should.eql(lunaPosts[1].body)
      })

      it("Luna can find own posts in 'luna' scope", async () => {
        const query = SearchQueryParser.parse('baker from:luna')

        const searchResults = await dbAdapter.searchUserPosts(query, luna.id, lunaVisibleFeedIds, bannedByLunaUserIds, 0, 30)
        searchResults.should.not.be.empty
        searchResults.length.should.eql(1)
        searchResults[0].should.have.property('uid')
        searchResults[0].uid.should.eql(lunaPosts[1].id)
        searchResults[0].should.have.property('body')
        searchResults[0].body.should.eql(lunaPosts[1].body)
      })
    })

    describe('Luna and Mars are friends', () => {
      beforeEach(async () => {
        const [marsTimelineId, lunaTimelineId] = await Promise.all([mars.getPostsTimelineId(), luna.getPostsTimelineId()])
        await Promise.all([luna.subscribeTo(marsTimelineId), mars.subscribeTo(lunaTimelineId)]);
        lunaVisibleFeedIds = (await dbAdapter.getUserById(luna.id)).subscribedFeedIds
        marsVisibleFeedIds = (await dbAdapter.getUserById(mars.id)).subscribedFeedIds
      })

      it("Mars can find Luna's posts", async () => {
        const query = SearchQueryParser.parse('baker')

        const searchResults = await dbAdapter.searchPosts(query, mars.id, marsVisibleFeedIds, bannedByMarsUserIds, 0, 30)
        searchResults.should.not.be.empty
        searchResults.length.should.eql(1)
        searchResults[0].should.have.property('uid')
        searchResults[0].uid.should.eql(lunaPosts[1].id)
        searchResults[0].should.have.property('body')
        searchResults[0].body.should.eql(lunaPosts[1].body)
      })

      it('Luna can find own posts', async () => {
        const query = SearchQueryParser.parse('baker')

        const searchResults = await dbAdapter.searchPosts(query, luna.id, lunaVisibleFeedIds, bannedByLunaUserIds, 0, 30)
        searchResults.should.not.be.empty
        searchResults.length.should.eql(1)
        searchResults[0].should.have.property('uid')
        searchResults[0].uid.should.eql(lunaPosts[1].id)
        searchResults[0].should.have.property('body')
        searchResults[0].body.should.eql(lunaPosts[1].body)
      })

      it("Mars can find Luna's posts in 'luna' scope", async () => {
        const query = SearchQueryParser.parse('baker from:luna')

        const searchResults = await dbAdapter.searchUserPosts(query, luna.id, marsVisibleFeedIds, bannedByMarsUserIds, 0, 30)
        searchResults.should.not.be.empty
        searchResults.length.should.eql(1)
        searchResults[0].should.have.property('uid')
        searchResults[0].uid.should.eql(lunaPosts[1].id)
        searchResults[0].should.have.property('body')
        searchResults[0].body.should.eql(lunaPosts[1].body)
      })

      it("Luna can find own posts in 'luna' scope", async () => {
        const query = SearchQueryParser.parse('baker from:luna')

        const searchResults = await dbAdapter.searchUserPosts(query, luna.id, lunaVisibleFeedIds, bannedByLunaUserIds, 0, 30)
        searchResults.should.not.be.empty
        searchResults.length.should.eql(1)
        searchResults[0].should.have.property('uid')
        searchResults[0].uid.should.eql(lunaPosts[1].id)
        searchResults[0].should.have.property('body')
        searchResults[0].body.should.eql(lunaPosts[1].body)
      })
    })
  })


  describe('private user Luna, public user Mars, stranger Jupiter', () => {
    const lunaPostsContent = ['Able', 'Baker', 'Charlie', 'Dog']

    let luna
      , mars
      , jupiter
      , lunaPosts
      , lunaVisibleFeedIds
      , bannedByLunaUserIds
      , marsVisibleFeedIds
      , bannedByMarsUserIds
      , jupiterVisibleFeedIds
      , bannedByJupiterUserIds

    beforeEach(async () => {
      luna    = new User({ username: 'Luna', password: 'password' })
      mars    = new User({ username: 'Mars', password: 'password' })
      jupiter = new User({ username: 'Jupiter', password: 'password' })

      await Promise.all([luna.create(), mars.create(), jupiter.create()])
      await luna.update({ isPrivate: '1' })

      lunaVisibleFeedIds = (await dbAdapter.getUserById(luna.id)).subscribedFeedIds
      bannedByLunaUserIds = await luna.getBanIds()

      marsVisibleFeedIds = (await dbAdapter.getUserById(mars.id)).subscribedFeedIds
      bannedByMarsUserIds = await mars.getBanIds()

      lunaPosts = []
      for (const body of lunaPostsContent) {
        const post = await luna.newPost({ body })  // eslint-disable-line babel/no-await-in-loop
        lunaPosts.push(await post.create())  // eslint-disable-line babel/no-await-in-loop
      }
    })

    describe('Luna and Mars are not friends', () => {
      it("Mars can't find Luna's posts", async () => {
        const query = SearchQueryParser.parse('baker')

        const searchResults = await dbAdapter.searchPosts(query, mars.id, marsVisibleFeedIds, bannedByMarsUserIds, 0, 30)
        searchResults.should.be.empty
      })

      it('Luna can find own posts', async () => {
        const query = SearchQueryParser.parse('baker')

        const searchResults = await dbAdapter.searchPosts(query, luna.id, lunaVisibleFeedIds, bannedByLunaUserIds, 0, 30)
        searchResults.should.not.be.empty
        searchResults.length.should.eql(1)
        searchResults[0].should.have.property('uid')
        searchResults[0].uid.should.eql(lunaPosts[1].id)
        searchResults[0].should.have.property('body')
        searchResults[0].body.should.eql(lunaPosts[1].body)
      })
    })

    describe('Luna and Mars are friends', () => {
      beforeEach(async () => {
        const [marsTimelineId, lunaTimelineId] = await Promise.all([mars.getPostsTimelineId(), luna.getPostsTimelineId()])
        await Promise.all([luna.subscribeTo(marsTimelineId), mars.subscribeTo(lunaTimelineId)]);
        marsVisibleFeedIds = (await dbAdapter.getUserById(mars.id)).subscribedFeedIds
        jupiterVisibleFeedIds = (await dbAdapter.getUserById(jupiter.id)).subscribedFeedIds
        bannedByJupiterUserIds = await jupiter.getBanIds()
      })

      it("Mars can find Luna's posts", async () => {
        const query = SearchQueryParser.parse('baker')

        const searchResults = await dbAdapter.searchPosts(query, mars.id, marsVisibleFeedIds, bannedByMarsUserIds, 0, 30)
        searchResults.should.not.be.empty
        searchResults.length.should.eql(1)
        searchResults[0].should.have.property('uid')
        searchResults[0].uid.should.eql(lunaPosts[1].id)
        searchResults[0].should.have.property('body')
        searchResults[0].body.should.eql(lunaPosts[1].body)
      })

      it('Luna can find own posts', async () => {
        const query = SearchQueryParser.parse('baker')

        const searchResults = await dbAdapter.searchPosts(query, luna.id, lunaVisibleFeedIds, bannedByLunaUserIds, 0, 30)
        searchResults.should.not.be.empty
        searchResults.length.should.eql(1)
        searchResults[0].should.have.property('uid')
        searchResults[0].uid.should.eql(lunaPosts[1].id)
        searchResults[0].should.have.property('body')
        searchResults[0].body.should.eql(lunaPosts[1].body)
      })

      it("Mars can find Luna's posts in 'luna' scope", async () => {
        const query = SearchQueryParser.parse('baker from:luna')

        const searchResults = await dbAdapter.searchUserPosts(query, luna.id, marsVisibleFeedIds, bannedByMarsUserIds, 0, 30)
        searchResults.should.not.be.empty
        searchResults.length.should.eql(1)
        searchResults[0].should.have.property('uid')
        searchResults[0].uid.should.eql(lunaPosts[1].id)
        searchResults[0].should.have.property('body')
        searchResults[0].body.should.eql(lunaPosts[1].body)
      })

      it("Jupiter can't find Luna's posts", async () => {
        const query = SearchQueryParser.parse('baker')

        const searchResults = await dbAdapter.searchPosts(query, jupiter.id, jupiterVisibleFeedIds, bannedByJupiterUserIds, 0, 30)
        searchResults.should.be.empty
      })
    })
  })

  describe('search patterns', () => {
    const searchFor = (term) => {
      const query = SearchQueryParser.parse(term);
      return dbAdapter.searchPosts(query, null, [], [], 0, 30);
    };

    let luna;

    beforeEach(async () => {
      luna = new User({ username: 'Luna', password: 'password' });
      await luna.create();
    });

    it('should not find pieces from the middle of words', async () => {
      const post = await luna.newPost({ body: 'hello foobar' });
      await post.create();

      {
        const searchResults = await searchFor('"oob"');
        searchResults.length.should.eql(0)
      }

      {
        const searchResults = await searchFor('"hello foob"');
        searchResults.length.should.eql(0)
      }
    });

    it('should find exact matches', async () => {
      const post = await luna.newPost({ body: 'hello foobar' });
      await post.create();

      {
        const searchResults = await searchFor('"hello"');
        searchResults.length.should.eql(1)
      }

      {
        const searchResults = await searchFor('"foobar"');
        searchResults.length.should.eql(1)
      }
    });

    it('should escape regexps-symbols while doing exact matches', async () => {
      const post = await luna.newPost({ body: 'hello, dollyg goodbye foobar!' });
      await post.create();

      {
        const searchResults = await searchFor('"hello, dolly. goodbye"');
        searchResults.length.should.eql(0)
      }
    });

    it('should be possible to search for usernames', async () => {
      const postTexts = [
        'hello @home!',
        '@home, are you here?',
        'I was visiting automation@home exhibition today. It was just as @homely told'  // shouldn't match for @home
      ];

      const posts = await Promise.all(postTexts.map((body) => luna.newPost({ body })));
      await Promise.all(posts.map((post) => post.create()));

      const searchResults = await searchFor('"@home"');
      searchResults.length.should.eql(2);

      const bodies = searchResults.map((row) => row.body);
      bodies.should.include(postTexts[0]);
      bodies.should.include(postTexts[1]);
    });

    it('should be possible to search for special char-patterns', async () => {
      const postTexts = [
        '$special pattern$',
        'text $special pattern$',
        '$special pattern$, text',
        'text, $special pattern$ text',
        'abc$special pattern$',
        '$special pattern$abc',
      ];

      const posts = await Promise.all(postTexts.map((body) => luna.newPost({ body })));
      await Promise.all(posts.map((post) => post.create()));

      const searchResults = await searchFor('"$special pattern$"');
      searchResults.length.should.eql(4);

      const bodies = searchResults.map((row) => row.body);
      bodies.should.include(postTexts[0]);
      bodies.should.include(postTexts[1]);
      bodies.should.include(postTexts[2]);
      bodies.should.include(postTexts[3]);
    });
  })
});
