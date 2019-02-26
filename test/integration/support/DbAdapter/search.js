/* eslint-env node, mocha */
/* global $pg_database */
/* eslint babel/semi: "error" */
import expect from 'unexpected';

import cleanDB from '../../../dbCleaner';
import { User, Group, dbAdapter } from '../../../../app/models';
import { SearchQueryParser } from '../../../../app/support/SearchQueryParser';


describe('FullTextSearch', () => {
  beforeEach(() => cleanDB($pg_database));

  describe('public users Luna, Mars', () => {
    const lunaPostsContent = ['Able', 'Baker', 'Charlie', 'Dog'];

    let luna, mars, lunaPosts, lunaVisibleFeedIds, bannedByLunaUserIds, marsVisibleFeedIds, bannedByMarsUserIds,
      feedsBannedForLuna, feedsBannedForMars;

    beforeEach(async () => {
      luna    = new User({ username: 'Luna', password: 'password' });
      mars    = new User({ username: 'Mars', password: 'password' });

      await Promise.all([luna.create(), mars.create()]);

      lunaVisibleFeedIds = (await dbAdapter.getUserById(luna.id)).subscribedFeedIds;
      bannedByLunaUserIds = await luna.getBanIds();
      feedsBannedForLuna = await dbAdapter.getFeedsIntIdsOfUsersWhoBannedViewer(luna.id);

      marsVisibleFeedIds = (await dbAdapter.getUserById(mars.id)).subscribedFeedIds;
      bannedByMarsUserIds = await mars.getBanIds();
      feedsBannedForMars = await dbAdapter.getFeedsIntIdsOfUsersWhoBannedViewer(mars.id);

      lunaPosts = [];

      for (const body of lunaPostsContent) {
        const post = await luna.newPost({ body });  // eslint-disable-line no-await-in-loop
        lunaPosts.push(await post.create());        // eslint-disable-line no-await-in-loop
      }
    });

    describe('Luna and Mars are not friends', () => {
      it("Mars can find Luna's posts", async () => {
        const query = SearchQueryParser.parse('baker');

        const searchResults = await dbAdapter.searchPosts(query, mars.id, marsVisibleFeedIds, bannedByMarsUserIds, feedsBannedForMars, 0, 30);
        searchResults.should.not.be.empty;
        searchResults.length.should.eql(1);
        searchResults[0].should.have.property('uid');
        searchResults[0].uid.should.eql(lunaPosts[1].id);
        searchResults[0].should.have.property('body');
        searchResults[0].body.should.eql(lunaPosts[1].body);
      });

      it('Luna can find own posts', async () => {
        const query = SearchQueryParser.parse('baker');

        const searchResults = await dbAdapter.searchPosts(query, luna.id, lunaVisibleFeedIds, bannedByLunaUserIds, feedsBannedForLuna, 0, 30);
        searchResults.should.not.be.empty;
        searchResults.length.should.eql(1);
        searchResults[0].should.have.property('uid');
        searchResults[0].uid.should.eql(lunaPosts[1].id);
        searchResults[0].should.have.property('body');
        searchResults[0].body.should.eql(lunaPosts[1].body);
      });

      it("Mars can find Luna's posts in 'luna' scope", async () => {
        const query = SearchQueryParser.parse('baker from:luna');

        const searchResults = await dbAdapter.searchUserPosts(query, luna.id, marsVisibleFeedIds, bannedByMarsUserIds, feedsBannedForMars, 0, 30);
        searchResults.should.not.be.empty;
        searchResults.length.should.eql(1);
        searchResults[0].should.have.property('uid');
        searchResults[0].uid.should.eql(lunaPosts[1].id);
        searchResults[0].should.have.property('body');
        searchResults[0].body.should.eql(lunaPosts[1].body);
      });

      it("Luna can find own posts in 'luna' scope", async () => {
        const query = SearchQueryParser.parse('baker from:luna');

        const searchResults = await dbAdapter.searchUserPosts(query, luna.id, lunaVisibleFeedIds, bannedByLunaUserIds, feedsBannedForLuna, 0, 30);
        searchResults.should.not.be.empty;
        searchResults.length.should.eql(1);
        searchResults[0].should.have.property('uid');
        searchResults[0].uid.should.eql(lunaPosts[1].id);
        searchResults[0].should.have.property('body');
        searchResults[0].body.should.eql(lunaPosts[1].body);
      });

      describe('there are some posts by mars', () => {
        beforeEach(async () => {
          const marsPostContents = ['Something', 'Else'];

          for (const body of marsPostContents) {
            const post = await mars.newPost({ body });  // eslint-disable-line no-await-in-loop
            await post.create();                        // eslint-disable-line no-await-in-loop
          }
        });

        it('Luna can find all of her posts', async () => {
          const query = SearchQueryParser.parse('from:luna');

          const searchResults = await dbAdapter.searchUserPosts(query, luna.id, lunaVisibleFeedIds, bannedByLunaUserIds, feedsBannedForLuna, 0, 30);
          expect(searchResults, 'to have length', 4);
        });
      });
    });

    describe('Luna and Mars are friends', () => {
      beforeEach(async () => {
        await Promise.all([luna.subscribeTo(mars), mars.subscribeTo(luna)]);
        lunaVisibleFeedIds = (await dbAdapter.getUserById(luna.id)).subscribedFeedIds;
        marsVisibleFeedIds = (await dbAdapter.getUserById(mars.id)).subscribedFeedIds;
      });

      it("Mars can find Luna's posts", async () => {
        const query = SearchQueryParser.parse('baker');

        const searchResults = await dbAdapter.searchPosts(query, mars.id, marsVisibleFeedIds, bannedByMarsUserIds, feedsBannedForMars, 0, 30);
        searchResults.should.not.be.empty;
        searchResults.length.should.eql(1);
        searchResults[0].should.have.property('uid');
        searchResults[0].uid.should.eql(lunaPosts[1].id);
        searchResults[0].should.have.property('body');
        searchResults[0].body.should.eql(lunaPosts[1].body);
      });

      it('Luna can find own posts', async () => {
        const query = SearchQueryParser.parse('baker');

        const searchResults = await dbAdapter.searchPosts(query, luna.id, lunaVisibleFeedIds, bannedByLunaUserIds, feedsBannedForLuna, 0, 30);
        searchResults.should.not.be.empty;
        searchResults.length.should.eql(1);
        searchResults[0].should.have.property('uid');
        searchResults[0].uid.should.eql(lunaPosts[1].id);
        searchResults[0].should.have.property('body');
        searchResults[0].body.should.eql(lunaPosts[1].body);
      });

      it("Mars can find Luna's posts in 'luna' scope", async () => {
        const query = SearchQueryParser.parse('baker from:luna');

        const searchResults = await dbAdapter.searchUserPosts(query, luna.id, marsVisibleFeedIds, bannedByMarsUserIds, feedsBannedForMars, 0, 30);
        searchResults.should.not.be.empty;
        searchResults.length.should.eql(1);
        searchResults[0].should.have.property('uid');
        searchResults[0].uid.should.eql(lunaPosts[1].id);
        searchResults[0].should.have.property('body');
        searchResults[0].body.should.eql(lunaPosts[1].body);
      });

      it("Luna can find own posts in 'luna' scope", async () => {
        const query = SearchQueryParser.parse('baker from:luna');

        const searchResults = await dbAdapter.searchUserPosts(query, luna.id, lunaVisibleFeedIds, bannedByLunaUserIds, feedsBannedForLuna, 0, 30);
        searchResults.should.not.be.empty;
        searchResults.length.should.eql(1);
        searchResults[0].should.have.property('uid');
        searchResults[0].uid.should.eql(lunaPosts[1].id);
        searchResults[0].should.have.property('body');
        searchResults[0].body.should.eql(lunaPosts[1].body);
      });
    });
  });

  describe('private user Luna, public user Mars, not visible to anonymous Saturn, stranger Jupiter, anonymous Uranus', () => {
    const lunaPostsContent = ['Able', 'Baker', 'Charlie', 'Dog'];
    const saturnPostsContent = ['Eagle', 'Fire', 'Gigantic'];
    const marsPostsContent = ['Humidity', 'Icicle', 'Job'];

    let luna, mars, jupiter, saturn, lunaPosts, lunaVisibleFeedIds, bannedByLunaUserIds,
      feedsBannedForJupiter, feedsBannedForLuna, feedsBannedForMars,
      marsVisibleFeedIds, bannedByMarsUserIds, jupiterVisibleFeedIds, bannedByJupiterUserIds, saturnPosts, marsPosts;

    beforeEach(async () => {
      luna    = new User({ username: 'Luna', password: 'password' });
      mars    = new User({ username: 'Mars', password: 'password' });
      jupiter = new User({ username: 'Jupiter', password: 'password' });
      saturn  = new User({ username: 'Saturn', password: 'password' });

      await Promise.all([luna.create(), mars.create(), jupiter.create(), saturn.create()]);
      await luna.update({ isPrivate: '1' });
      await saturn.update({ isProtected: '1' });

      lunaVisibleFeedIds = (await dbAdapter.getUserById(luna.id)).subscribedFeedIds;
      bannedByLunaUserIds = await luna.getBanIds();
      feedsBannedForLuna = await dbAdapter.getFeedsIntIdsOfUsersWhoBannedViewer(luna.id);

      marsVisibleFeedIds = (await dbAdapter.getUserById(mars.id)).subscribedFeedIds;
      bannedByMarsUserIds = await mars.getBanIds();
      feedsBannedForMars = await dbAdapter.getFeedsIntIdsOfUsersWhoBannedViewer(mars.id);

      lunaPosts = [];

      for (const body of lunaPostsContent) {
        const post = await luna.newPost({ body });  // eslint-disable-line no-await-in-loop
        lunaPosts.push(await post.create());        // eslint-disable-line no-await-in-loop
      }

      saturnPosts = [];

      for (const body of saturnPostsContent) {
        const post = await saturn.newPost({ body });  // eslint-disable-line no-await-in-loop
        saturnPosts.push(await post.create());        // eslint-disable-line no-await-in-loop
      }

      marsPosts = [];

      for (const body of marsPostsContent) {
        const post = await mars.newPost({ body });  // eslint-disable-line no-await-in-loop
        marsPosts.push(await post.create());        // eslint-disable-line no-await-in-loop
      }
    });

    describe('Luna and Mars are not friends', () => {
      it("Mars can't find Luna's posts", async () => {
        const query = SearchQueryParser.parse('baker');

        const searchResults = await dbAdapter.searchPosts(query, mars.id, marsVisibleFeedIds, bannedByMarsUserIds, feedsBannedForMars, 0, 30);
        searchResults.should.be.empty;
      });

      it('Luna can find own posts', async () => {
        const query = SearchQueryParser.parse('baker');

        const searchResults = await dbAdapter.searchPosts(query, luna.id, lunaVisibleFeedIds, bannedByLunaUserIds, feedsBannedForLuna, 0, 30);
        searchResults.should.not.be.empty;
        searchResults.length.should.eql(1);
        searchResults[0].should.have.property('uid');
        searchResults[0].uid.should.eql(lunaPosts[1].id);
        searchResults[0].should.have.property('body');
        searchResults[0].body.should.eql(lunaPosts[1].body);
      });
    });

    describe('Saturn doesn\'t like people who are not logged in', () => {
      beforeEach(async () => {
        marsVisibleFeedIds = (await dbAdapter.getUserById(mars.id)).subscribedFeedIds;
        jupiterVisibleFeedIds = (await dbAdapter.getUserById(jupiter.id)).subscribedFeedIds;
        bannedByJupiterUserIds = await jupiter.getBanIds();
      });

      it("Mars can find Saturn's posts", async () => {
        const query = SearchQueryParser.parse('gigantic');

        const searchResults = await dbAdapter.searchPosts(query, mars.id, marsVisibleFeedIds, bannedByMarsUserIds, feedsBannedForMars, 0, 30);
        searchResults.should.not.be.empty;
        searchResults.length.should.eql(1);
        searchResults[0].should.have.property('uid');
        searchResults[0].uid.should.eql(saturnPosts[2].id);
        searchResults[0].should.have.property('body');
        searchResults[0].body.should.eql(saturnPosts[2].body);
      });

      it("Uranus can't find Saturn's posts", async () => {
        const query = SearchQueryParser.parse('gigantic');

        const searchResults = await dbAdapter.searchPosts(query, null, [], [], [], 0, 30);
        searchResults.should.be.empty;
      });

      it("Uranus can find Mars' posts", async () => {
        const query = SearchQueryParser.parse('icicle');

        const searchResults = await dbAdapter.searchPosts(query, null, [], [], [], 0, 30);
        searchResults.should.not.be.empty;
        searchResults.length.should.eql(1);
        searchResults[0].should.have.property('uid');
        searchResults[0].uid.should.eql(marsPosts[1].id);
        searchResults[0].should.have.property('body');
        searchResults[0].body.should.eql(marsPosts[1].body);
      });
    });

    describe('Luna and Mars are friends', () => {
      beforeEach(async () => {
        await Promise.all([luna.subscribeTo(mars), mars.subscribeTo(luna)]);
        marsVisibleFeedIds = (await dbAdapter.getUserById(mars.id)).subscribedFeedIds;
        jupiterVisibleFeedIds = (await dbAdapter.getUserById(jupiter.id)).subscribedFeedIds;
        bannedByJupiterUserIds = await jupiter.getBanIds();
        feedsBannedForJupiter = await dbAdapter.getFeedsIntIdsOfUsersWhoBannedViewer(jupiter.id);
      });

      it("Mars can find Luna's posts", async () => {
        const query = SearchQueryParser.parse('baker');

        const searchResults = await dbAdapter.searchPosts(query, mars.id, marsVisibleFeedIds, bannedByMarsUserIds, feedsBannedForMars, 0, 30);
        searchResults.should.not.be.empty;
        searchResults.length.should.eql(1);
        searchResults[0].should.have.property('uid');
        searchResults[0].uid.should.eql(lunaPosts[1].id);
        searchResults[0].should.have.property('body');
        searchResults[0].body.should.eql(lunaPosts[1].body);
      });

      it('Luna can find own posts', async () => {
        const query = SearchQueryParser.parse('baker');

        const searchResults = await dbAdapter.searchPosts(query, luna.id, lunaVisibleFeedIds, bannedByLunaUserIds, feedsBannedForLuna, 0, 30);
        searchResults.should.not.be.empty;
        searchResults.length.should.eql(1);
        searchResults[0].should.have.property('uid');
        searchResults[0].uid.should.eql(lunaPosts[1].id);
        searchResults[0].should.have.property('body');
        searchResults[0].body.should.eql(lunaPosts[1].body);
      });

      it("Mars can find Luna's posts in 'luna' scope", async () => {
        const query = SearchQueryParser.parse('baker from:luna');

        const searchResults = await dbAdapter.searchUserPosts(query, luna.id, marsVisibleFeedIds, bannedByMarsUserIds, feedsBannedForMars, 0, 30);
        searchResults.should.not.be.empty;
        searchResults.length.should.eql(1);
        searchResults[0].should.have.property('uid');
        searchResults[0].uid.should.eql(lunaPosts[1].id);
        searchResults[0].should.have.property('body');
        searchResults[0].body.should.eql(lunaPosts[1].body);
      });

      it("Jupiter can't find Luna's posts", async () => {
        const query = SearchQueryParser.parse('baker');

        const searchResults = await dbAdapter.searchPosts(query, jupiter.id, jupiterVisibleFeedIds, bannedByJupiterUserIds, feedsBannedForJupiter, 0, 30);
        searchResults.should.be.empty;
      });
    });
  });

  describe('search patterns', () => {
    const searchFor = (term) => {
      const query = SearchQueryParser.parse(term);
      return dbAdapter.searchPosts(query, null, [], [], [], 0, 30);
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
        searchResults.length.should.eql(0);
      }

      {
        const searchResults = await searchFor('"hello foob"');
        searchResults.length.should.eql(0);
      }
    });

    it('should find exact matches', async () => {
      const post = await luna.newPost({ body: 'hello foobar' });
      await post.create();

      {
        const searchResults = await searchFor('"hello"');
        searchResults.length.should.eql(1);
      }

      {
        const searchResults = await searchFor('"foobar"');
        searchResults.length.should.eql(1);
      }
    });

    it('should escape regexps-symbols while doing exact matches', async () => {
      const post = await luna.newPost({ body: 'hello, dollyg goodbye foobar!' });
      await post.create();

      {
        const searchResults = await searchFor('"hello, dolly. goodbye"');
        searchResults.length.should.eql(0);
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
  });

  describe('banned users content', () => {
    let luna, mars, jupiter;

    const _becomeFriends = async (user1, user2) => {
      await Promise.all([
        user1.subscribeTo(user2),
        user2.subscribeTo(user1),
      ]);
    };

    const _createPost = async (author, text) => {
      const post = await author.newPost({ body: text });
      return post.create();
    };

    const _createGroupPost = async (author, groupPostsFeedId, text) => {
      const post = await author.newPost({ body: text, timelineIds: [groupPostsFeedId] });
      return post.create();
    };

    const _createComment = async (commenter, commentBody, thePost) => {
      const comment = await commenter.newComment({
        body:   commentBody,
        postId: thePost.id
      });

      return comment.create();
    };

    beforeEach(async () => {
      luna = new User({ username: 'Luna', password: 'password' });
      mars = new User({ username: 'Mars', password: 'password' });
      jupiter = new User({ username: 'Jupiter', password: 'password' });

      await Promise.all([
        luna.create(),
        mars.create(),
        jupiter.create(),
      ]);
    });

    describe('public posts search', () => {
      const _searchPublicPosts = async (term, viewer) => {
        const bannedUserIdsPromise = viewer.getBanIds();
        const feedsBannedForUser = dbAdapter.getFeedsIntIdsOfUsersWhoBannedViewer(viewer.id);
        const query = SearchQueryParser.parse(term);

        return dbAdapter.searchPosts(query, null, [], await bannedUserIdsPromise, await feedsBannedForUser, 0, 30);
      };

      it('should not find post from banned user', async () => {
        await _createPost(mars, 'Lazy green fox jumps over the #lazy dog');
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPublicPosts('fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicPosts('"fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicPosts('#lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it('should not find posts in feed of user who banned us', async () => {
        await _createPost(mars, 'Lazy green fox jumps over the #lazy dog');
        await mars.ban('luna');

        await Promise.all([
          expect(_searchPublicPosts('fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicPosts('"fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicPosts('#lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find post from banned user by banned user's comment match", async () => {
        const post = await _createPost(mars, 'Lazy sloth');
        await _createComment(mars, 'Lazy green fox jumps over the #lazy dog', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPublicPosts('fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicPosts('"fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicPosts('#lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find post from banned user by other user's comment match", async () => {
        const post = await _createPost(mars, 'Lazy sloth');
        await _createComment(jupiter, 'Very #lazy fox', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPublicPosts('fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicPosts('"fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicPosts('#lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find post from banned user by viewer's comment match", async () => {
        const post = await _createPost(mars, 'Lazy sloth');
        await _createComment(luna, 'Very #lazy fox', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPublicPosts('fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicPosts('"fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicPosts('#lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it(`should not find posts in feed of user who banned us by viewer's comment match`, async () => {
        const post = await _createPost(mars, 'Lazy sloth');
        await _createComment(luna, 'Very #lazy fox', post);
        await mars.ban('luna');

        await Promise.all([
          expect(_searchPublicPosts('fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicPosts('"fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicPosts('#lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find visible post by banned user's comment match", async () => {
        const post = await _createPost(jupiter, 'Lazy sloth');
        await _createComment(mars, 'Very #lazy fox', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPublicPosts('fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicPosts('"fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicPosts('#lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });
    });

    describe('private posts search', () => {
      beforeEach(async () => {
        await Promise.all([
          _becomeFriends(luna, mars),
          _becomeFriends(luna, jupiter),
          _becomeFriends(jupiter, mars),
        ]);

        await Promise.all([
          luna.update({ isPrivate: '1' }),
          mars.update({ isPrivate: '1' }),
          jupiter.update({ isPrivate: '1' }),
        ]);
      });

      const _searchPrivatePosts = async (term, viewer) => {
        const refetchedUserPromise = dbAdapter.getUserById(viewer.id);
        const bannedUserIdsPromise = viewer.getBanIds();
        const feedsBannedForUser = dbAdapter.getFeedsIntIdsOfUsersWhoBannedViewer(viewer.id);
        const query = SearchQueryParser.parse(term);

        return dbAdapter.searchPosts(
          query,
          viewer.id,
          (await refetchedUserPromise).subscribedFeedIds,
          await bannedUserIdsPromise,
          await feedsBannedForUser,
          0,
          30
        );
      };

      it('should not find post from banned user', async () => {
        await _createPost(mars, 'Lazy green fox jumps over the #lazy dog');
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPrivatePosts('fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivatePosts('"fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivatePosts('#lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find post from banned user by banned user's comment match", async () => {
        const post = await _createPost(mars, 'Lazy sloth');
        await _createComment(mars, 'Lazy green fox jumps over the #lazy dog', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPrivatePosts('fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivatePosts('"fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivatePosts('#lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find post from banned user by other user's comment match", async () => {
        const post = await _createPost(mars, 'Lazy sloth');
        await _createComment(jupiter, 'Very #lazy fox', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPrivatePosts('fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivatePosts('"fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivatePosts('#lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find post from banned user by viewer's comment match", async () => {
        const post = await _createPost(mars, 'Lazy sloth');
        await _createComment(luna, 'Very #lazy fox', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPrivatePosts('fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivatePosts('"fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivatePosts('#lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find visible post by banned user's comment match", async () => {
        const post = await _createPost(jupiter, 'Lazy sloth');
        await _createComment(mars, 'Very #lazy fox', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPrivatePosts('fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivatePosts('"fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivatePosts('#lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });
    });

    describe('public posts search with specified author', () => {
      const _searchPublicUserPosts = async (term, viewer) => {
        const bannedUserIdsPromise = viewer.getBanIds();
        const feedsBannedForUser = dbAdapter.getFeedsIntIdsOfUsersWhoBannedViewer(viewer.id);
        const query = SearchQueryParser.parse(term);
        const targetUserPromise = dbAdapter.getUserByUsername(query.username);

        return dbAdapter.searchUserPosts(query, (await targetUserPromise).id, [], await bannedUserIdsPromise, await feedsBannedForUser, 0, 30);
      };

      it('should not find post from banned user', async () => {
        await _createPost(mars, 'Lazy green fox jumps over the #lazy dog');
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPublicUserPosts('from: mars fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicUserPosts('from: mars "fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicUserPosts('from: mars #lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find post from banned user by banned user's comment match", async () => {
        const post = await _createPost(mars, 'Lazy sloth');
        await _createComment(mars, 'Lazy green fox jumps over the #lazy dog', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPublicUserPosts('from: mars fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicUserPosts('from: mars "fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicUserPosts('from: mars #lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find post from banned user by other user's comment match", async () => {
        const post = await _createPost(mars, 'Lazy sloth');
        await _createComment(jupiter, 'Very #lazy fox', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPublicUserPosts('from: mars fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicUserPosts('from: mars "fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicUserPosts('from: mars #lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find post from banned user by viewer's comment match", async () => {
        const post = await _createPost(mars, 'Lazy sloth');
        await _createComment(luna, 'Very #lazy fox', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPublicUserPosts('from: mars fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicUserPosts('from: mars "fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicUserPosts('from: mars #lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find visible post by banned user's comment match", async () => {
        const post = await _createPost(jupiter, 'Lazy sloth');
        await _createComment(mars, 'Very #lazy fox', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPublicUserPosts('from: mars fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicUserPosts('from: mars "fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicUserPosts('from: mars #lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });
    });

    describe('private posts search with specified author', () => {
      beforeEach(async () => {
        await Promise.all([
          _becomeFriends(luna, mars),
          _becomeFriends(luna, jupiter),
          _becomeFriends(jupiter, mars),
        ]);

        await Promise.all([
          luna.update({ isPrivate: '1' }),
          mars.update({ isPrivate: '1' }),
          jupiter.update({ isPrivate: '1' }),
        ]);
      });

      const _searchPrivateUserPosts = async (term, viewer) => {
        const visibleFeedIds = (await dbAdapter.getUserById(viewer.id)).subscribedFeedIds;
        const bannedUserIds = await viewer.getBanIds();
        const feedsBannedForUser = dbAdapter.getFeedsIntIdsOfUsersWhoBannedViewer(viewer.id);

        const query = SearchQueryParser.parse(term);
        const targetUser = await dbAdapter.getUserByUsername(query.username);
        return dbAdapter.searchUserPosts(query, targetUser.id, visibleFeedIds, bannedUserIds, await feedsBannedForUser, 0, 30);
      };

      it('should not find post from banned user', async () => {
        await _createPost(mars, 'Lazy green fox jumps over the #lazy dog');
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPrivateUserPosts('from: mars fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivateUserPosts('from: mars "fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivateUserPosts('from: mars #lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find post from banned user by banned user's comment match", async () => {
        const post = await _createPost(mars, 'Lazy sloth');
        await _createComment(mars, 'Lazy green fox jumps over the #lazy dog', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPrivateUserPosts('from: mars fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivateUserPosts('from: mars "fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivateUserPosts('from: mars #lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find post from banned user by other user's comment match", async () => {
        const post = await _createPost(mars, 'Lazy sloth');
        await _createComment(jupiter, 'Very #lazy fox', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPrivateUserPosts('from: mars fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivateUserPosts('from: mars "fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivateUserPosts('from: mars #lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find post from banned user by viewer's comment match", async () => {
        const post = await _createPost(mars, 'Lazy sloth');
        await _createComment(luna, 'Very #lazy fox', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPrivateUserPosts('from: mars fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivateUserPosts('from: mars "fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivateUserPosts('from: mars #lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find visible post by banned user's comment match", async () => {
        const post = await _createPost(jupiter, 'Lazy sloth');
        await _createComment(mars, 'Very #lazy fox', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPrivateUserPosts('from: mars fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivateUserPosts('from: mars "fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivateUserPosts('from: mars #lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });
    });

    describe('public posts search with specified group', () => {
      let groupTimelineId;

      beforeEach(async () => {
        const group = new Group({ username: 'search-dev' });
        await group.create(luna.id, false);

        groupTimelineId = await group.getPostsTimelineId();

        await Promise.all([
          mars.subscribeTo(group),
          jupiter.subscribeTo(group),
        ]);
      });

      const _searchPublicGroupPosts = async (term, viewer) => {
        const bannedUserIdsPromise = viewer.getBanIds();
        const feedsBannedForUser = dbAdapter.getFeedsIntIdsOfUsersWhoBannedViewer(viewer.id);

        const query = SearchQueryParser.parse(term);
        const targetGroup = await dbAdapter.getGroupByUsername(query.group);
        const groupPostsFeedId = await targetGroup.getPostsTimelineId();

        return dbAdapter.searchGroupPosts(query, groupPostsFeedId, null, [], await bannedUserIdsPromise, await feedsBannedForUser, 0, 30);
      };

      it('should not find post from banned user', async () => {
        await _createGroupPost(mars, groupTimelineId, 'Lazy green fox jumps over the #lazy dog');
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPublicGroupPosts('group: search-dev fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicGroupPosts('group: search-dev "fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicGroupPosts('group: search-dev #lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find post from banned user by banned user's comment match", async () => {
        const post = await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
        await _createComment(mars, 'Lazy green fox jumps over the #lazy dog', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPublicGroupPosts('group: search-dev fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicGroupPosts('group: search-dev "fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicGroupPosts('group: search-dev #lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find post from banned user by other user's comment match", async () => {
        const post = await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
        await _createComment(jupiter, 'Very #lazy fox', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPublicGroupPosts('group: search-dev fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicGroupPosts('group: search-dev "fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicGroupPosts('group: search-dev #lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find post from banned user by viewer's comment match", async () => {
        const post = await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
        await _createComment(luna, 'Very #lazy fox', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPublicGroupPosts('group: search-dev fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicGroupPosts('group: search-dev "fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicGroupPosts('group: search-dev #lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find visible post by banned user's comment match", async () => {
        const post = await _createGroupPost(jupiter, groupTimelineId, 'Lazy sloth');
        await _createComment(mars, 'Very #lazy fox', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPublicGroupPosts('group: search-dev fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicGroupPosts('group: search-dev "fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPublicGroupPosts('group: search-dev #lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });
    });

    describe('private posts search with specified group', () => {
      let group, groupTimelineId;

      beforeEach(async () => {
        group = new Group({ username: 'search-dev', isPrivate: '1' });
        await group.create(luna.id, false);
        groupTimelineId = await group.getPostsTimelineId();
        await mars.subscribeTo(group);
        return jupiter.subscribeTo(group);
      });

      const _searchPrivateGroupPosts = async (term, viewer) => {
        const refetchedUserPromise = dbAdapter.getUserById(viewer.id);
        const bannedUserIdsPromise = viewer.getBanIds();
        const feedsBannedForUser = dbAdapter.getFeedsIntIdsOfUsersWhoBannedViewer(viewer.id);

        const query = SearchQueryParser.parse(term);
        const targetGroup = await dbAdapter.getGroupByUsername(query.group);
        const groupPostsFeedId = await targetGroup.getPostsTimelineId();

        return dbAdapter.searchGroupPosts(
          query,
          groupPostsFeedId,
          null,
          (await refetchedUserPromise).subscribedFeedIds,
          await bannedUserIdsPromise,
          await feedsBannedForUser,
          0,
          30
        );
      };

      it('should not find post from banned user', async () => {
        await _createGroupPost(mars, groupTimelineId, 'Lazy green fox jumps over the #lazy dog');
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPrivateGroupPosts('group: search-dev fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivateGroupPosts('group: search-dev "fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivateGroupPosts('group: search-dev #lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find post from banned user by banned user's comment match", async () => {
        const post = await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
        await _createComment(mars, 'Lazy green fox jumps over the #lazy dog', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPrivateGroupPosts('group: search-dev fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivateGroupPosts('group: search-dev "fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivateGroupPosts('group: search-dev #lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find post from banned user by other user's comment match", async () => {
        const post = await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
        await _createComment(jupiter, 'Very #lazy fox', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPrivateGroupPosts('group: search-dev fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivateGroupPosts('group: search-dev "fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivateGroupPosts('group: search-dev #lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find post from banned user by viewer's comment match", async () => {
        const post = await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
        await _createComment(luna, 'Very #lazy fox', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPrivateGroupPosts('group: search-dev fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivateGroupPosts('group: search-dev "fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivateGroupPosts('group: search-dev #lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });

      it("should not find visible post by banned user's comment match", async () => {
        const post = await _createGroupPost(jupiter, groupTimelineId, 'Lazy sloth');
        await _createComment(mars, 'Very #lazy fox', post);
        await luna.ban('mars');

        await Promise.all([
          expect(_searchPrivateGroupPosts('group: search-dev fox', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivateGroupPosts('group: search-dev "fox"', luna), 'when fulfilled', 'to have length', 0),
          expect(_searchPrivateGroupPosts('group: search-dev #lazy', luna), 'when fulfilled', 'to have length', 0),
        ]);
      });
    });
  });

  describe('group post search', () => {
    let luna, mars, jupiter;

    const _createGroupPost = async (author, groupPostsFeedId, text) => {
      const post = await author.newPost({ body: text, timelineIds: [groupPostsFeedId] });
      return post.create();
    };

    const _createComment = async (commenter, commentBody, thePost) => {
      const comment = await commenter.newComment({
        body:   commentBody,
        postId: thePost.id
      });

      return comment.create();
    };

    beforeEach(async () => {
      luna = new User({ username: 'Luna', password: 'password' });
      mars = new User({ username: 'Mars', password: 'password' });
      jupiter = new User({ username: 'Jupiter', password: 'password' });

      await Promise.all([
        luna.create(),
        mars.create(),
        jupiter.create(),
      ]);
    });

    describe('public posts search with specified group', () => {
      let groupTimelineId;

      beforeEach(async () => {
        const group = new Group({ username: 'search-dev' });
        await group.create(luna.id, false);

        groupTimelineId = await group.getPostsTimelineId();
        return mars.subscribeTo(group);
      });

      const _searchPublicGroupPosts = async (term, viewer) => {
        const bannedUserIds = await viewer.getBanIds();
        const feedsBannedForUser = dbAdapter.getFeedsIntIdsOfUsersWhoBannedViewer(viewer.id);

        const query = SearchQueryParser.parse(term);
        const targetGroup = await dbAdapter.getGroupByUsername(query.group);
        const groupPostsFeedId = await targetGroup.getPostsTimelineId();

        const author = query.username ? (await dbAdapter.getUserByUsername(query.username)).id : null;

        return dbAdapter.searchGroupPosts(query, groupPostsFeedId, author, [], bannedUserIds, await feedsBannedForUser, 0, 30);
      };

      it('should find post in specified group', async () => {
        const post = await _createGroupPost(mars, groupTimelineId, 'Lazy green fox jumps over the #lazy dog');

        await expect(_searchPublicGroupPosts('group: search-dev fox', luna), 'when fulfilled', 'to have length', 1)
          .and('when fulfilled', 'to have an item satisfying', { body: post.body });
        await expect(_searchPublicGroupPosts('group: search-dev "fox"', luna), 'when fulfilled', 'to have length', 1)
          .and('when fulfilled', 'to have an item satisfying', { body: post.body });
        await expect(_searchPublicGroupPosts('group: search-dev #lazy', luna), 'when fulfilled', 'to have length', 1)
          .and('when fulfilled', 'to have an item satisfying', { body: post.body });
      });

      it('should find post in specified group by comment match', async () => {
        const post = await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
        await _createComment(mars, 'Lazy green fox jumps over the #lazy dog', post);

        await expect(_searchPublicGroupPosts('group: search-dev fox', luna), 'when fulfilled', 'to have length', 1)
          .and('when fulfilled', 'to have an item satisfying', { body: post.body });
        await expect(_searchPublicGroupPosts('group: search-dev "fox"', luna), 'when fulfilled', 'to have length', 1)
          .and('when fulfilled', 'to have an item satisfying', { body: post.body });
        await expect(_searchPublicGroupPosts('group: search-dev #lazy', luna), 'when fulfilled', 'to have length', 1)
          .and('when fulfilled', 'to have an item satisfying', { body: post.body });
      });

      it("should find post in specified group by viewer's comment match", async () => {
        const post = await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
        await _createComment(luna, 'Very #lazy fox', post);

        await expect(_searchPublicGroupPosts('group: search-dev fox', luna), 'when fulfilled', 'to have length', 1)
          .and('when fulfilled', 'to have an item satisfying', { body: post.body });
        await expect(_searchPublicGroupPosts('group: search-dev "fox"', luna), 'when fulfilled', 'to have length', 1)
          .and('when fulfilled', 'to have an item satisfying', { body: post.body });
        await expect(_searchPublicGroupPosts('group: search-dev #lazy', luna), 'when fulfilled', 'to have length', 1)
          .and('when fulfilled', 'to have an item satisfying', { body: post.body });
      });

      it('should find post only in specified group', async () => {
        const group2 = new Group({ username: 'search-dev2' });
        await group2.create(luna.id, false);
        const group2TimelineId = await group2.getPostsTimelineId();
        await mars.subscribeTo(group2);

        await _createGroupPost(mars, group2TimelineId, 'Lazy green fox jumps over the #lazy pig');
        const post = await _createGroupPost(mars, groupTimelineId, 'Lazy green fox jumps over the #lazy dog');

        await expect(_searchPublicGroupPosts('group: search-dev fox', luna), 'when fulfilled', 'to have length', 1)
          .and('when fulfilled', 'to have an item satisfying', { body: post.body });
        await expect(_searchPublicGroupPosts('group: search-dev "fox"', luna), 'when fulfilled', 'to have length', 1)
          .and('when fulfilled', 'to have an item satisfying', { body: post.body });
        await expect(_searchPublicGroupPosts('group: search-dev #lazy', luna), 'when fulfilled', 'to have length', 1)
          .and('when fulfilled', 'to have an item satisfying', { body: post.body });
      });

      describe('by specified author', () => {
        const _createPost = async (author, text) => {
          const post = await author.newPost({ body: text });
          return post.create();
        };

        it('should find post only in specified group', async () => {
          const group2 = new Group({ username: 'search-dev2' });
          await group2.create(luna.id, false);
          const group2TimelineId = await group2.getPostsTimelineId();
          await mars.subscribeTo(group2);

          await _createGroupPost(mars, group2TimelineId, 'Lazy green fox jumps over the #lazy pig');
          await _createPost(mars, 'Lazy green fox jumps over the #lazy pig');
          const post = await _createGroupPost(mars, groupTimelineId, 'Lazy green fox jumps over the #lazy dog');
          await _createGroupPost(jupiter, groupTimelineId, 'Lazy green fox jumps over the #lazy jupiter');

          await expect(_searchPublicGroupPosts('group: search-dev from:mars fox', luna), 'when fulfilled', 'to have length', 1)
            .and('when fulfilled', 'to have an item satisfying', { body: post.body });
          await expect(_searchPublicGroupPosts('group: search-dev from:mars "fox"', luna), 'when fulfilled', 'to have length', 1)
            .and('when fulfilled', 'to have an item satisfying', { body: post.body });
          await expect(_searchPublicGroupPosts('group: search-dev from:mars #lazy', luna), 'when fulfilled', 'to have length', 1)
            .and('when fulfilled', 'to have an item satisfying', { body: post.body });
        });
      });
    });

    describe('private posts search with specified group', () => {
      let groupTimelineId;

      beforeEach(async () => {
        const group = new Group({ username: 'search-dev', isPrivate: '1' });
        await group.create(luna.id, false);

        groupTimelineId = await group.getPostsTimelineId();
        return mars.subscribeTo(group);
      });

      const _searchPrivateGroupPosts = async (term, viewer) => {
        const visibleFeedIds = (await dbAdapter.getUserById(viewer.id)).subscribedFeedIds;
        const bannedUserIds = await viewer.getBanIds();
        const feedsBannedForUser = dbAdapter.getFeedsIntIdsOfUsersWhoBannedViewer(viewer.id);

        const query = SearchQueryParser.parse(term);
        const targetGroup = await dbAdapter.getGroupByUsername(query.group);
        const groupPostsFeedId = await targetGroup.getPostsTimelineId();
        return dbAdapter.searchGroupPosts(query, groupPostsFeedId, null, visibleFeedIds, bannedUserIds, await feedsBannedForUser, 0, 30);
      };

      describe('for group subscribers', () => {
        it('should find post in specified group', async () => {
          const post = await _createGroupPost(mars, groupTimelineId, 'Lazy green fox jumps over the #lazy dog');

          await expect(_searchPrivateGroupPosts('group: search-dev fox', luna), 'when fulfilled', 'to have length', 1)
            .and('when fulfilled', 'to have an item satisfying', { body: post.body });
          await expect(_searchPrivateGroupPosts('group: search-dev "fox"', luna), 'when fulfilled', 'to have length', 1)
            .and('when fulfilled', 'to have an item satisfying', { body: post.body });
          await expect(_searchPrivateGroupPosts('group: search-dev #lazy', luna), 'when fulfilled', 'to have length', 1)
            .and('when fulfilled', 'to have an item satisfying', { body: post.body });
        });

        it('should find post in specified group by comment match', async () => {
          const post = await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(mars, 'Lazy green fox jumps over the #lazy dog', post);

          await expect(_searchPrivateGroupPosts('group: search-dev fox', luna), 'when fulfilled', 'to have length', 1)
            .and('when fulfilled', 'to have an item satisfying', { body: post.body });
          await expect(_searchPrivateGroupPosts('group: search-dev "fox"', luna), 'when fulfilled', 'to have length', 1)
            .and('when fulfilled', 'to have an item satisfying', { body: post.body });
          await expect(_searchPrivateGroupPosts('group: search-dev #lazy', luna), 'when fulfilled', 'to have length', 1)
            .and('when fulfilled', 'to have an item satisfying', { body: post.body });
        });

        it("should find post in specified group by viewer's comment match", async () => {
          const post = await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(luna, 'Very #lazy fox', post);

          await expect(_searchPrivateGroupPosts('group: search-dev fox', luna), 'when fulfilled', 'to have length', 1)
            .and('when fulfilled', 'to have an item satisfying', { body: post.body });
          await expect(_searchPrivateGroupPosts('group: search-dev "fox"', luna), 'when fulfilled', 'to have length', 1)
            .and('when fulfilled', 'to have an item satisfying', { body: post.body });
          await expect(_searchPrivateGroupPosts('group: search-dev #lazy', luna), 'when fulfilled', 'to have length', 1)
            .and('when fulfilled', 'to have an item satisfying', { body: post.body });
        });

        it('should find post only in specified group', async () => {
          const group2 = new Group({ username: 'search-dev2' });
          await group2.create(luna.id, false);
          const group2TimelineId = await group2.getPostsTimelineId();
          await mars.subscribeTo(group2);
          await jupiter.subscribeTo(group2);

          await _createGroupPost(mars, group2TimelineId, 'Lazy green fox jumps over the #lazy pig');
          const post = await _createGroupPost(mars, groupTimelineId, 'Lazy green fox jumps over the #lazy dog');

          await expect(_searchPrivateGroupPosts('group: search-dev fox', luna), 'when fulfilled', 'to have length', 1)
            .and('when fulfilled', 'to have an item satisfying', { body: post.body });
          await expect(_searchPrivateGroupPosts('group: search-dev "fox"', luna), 'when fulfilled', 'to have length', 1)
            .and('when fulfilled', 'to have an item satisfying', { body: post.body });
          await expect(_searchPrivateGroupPosts('group: search-dev #lazy', luna), 'when fulfilled', 'to have length', 1)
            .and('when fulfilled', 'to have an item satisfying', { body: post.body });
        });
      });

      describe('for non-subscribers', () => {
        it('should not find post in specified group', async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy green fox jumps over the #lazy dog');

          await expect(_searchPrivateGroupPosts('group: search-dev fox', jupiter), 'when fulfilled', 'to have length', 0);
          await expect(_searchPrivateGroupPosts('group: search-dev "fox"', jupiter), 'when fulfilled', 'to have length', 0);
          await expect(_searchPrivateGroupPosts('group: search-dev #lazy', jupiter), 'when fulfilled', 'to have length', 0);
        });

        it('should not find post in specified group by comment match', async () => {
          const post = await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(mars, 'Lazy green fox jumps over the #lazy dog', post);

          await expect(_searchPrivateGroupPosts('group: search-dev fox', jupiter), 'when fulfilled', 'to have length', 0);
          await expect(_searchPrivateGroupPosts('group: search-dev "fox"', jupiter), 'when fulfilled', 'to have length', 0);
          await expect(_searchPrivateGroupPosts('group: search-dev #lazy', jupiter), 'when fulfilled', 'to have length', 0);
        });
      });
    });
  });
});
