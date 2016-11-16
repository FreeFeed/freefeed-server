/* eslint-env node, mocha */
/* global $pg_database */
import knexCleaner from 'knex-cleaner'
import { User, Group, dbAdapter } from '../../app/models'
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


  describe('private user Luna, public user Mars, not visible to anonymous Saturn, stranger Jupiter, anonymous Uranus', () => {
    const lunaPostsContent = ['Able', 'Baker', 'Charlie', 'Dog']
    const saturnPostsContent = ['Eagle', 'Fire', 'Gigantic']
    const marsPostsContent = ['Humidity', 'Icicle', 'Job']

    let luna
      , mars
      , jupiter
      , saturn
      , lunaPosts
      , lunaVisibleFeedIds
      , bannedByLunaUserIds
      , marsVisibleFeedIds
      , bannedByMarsUserIds
      , jupiterVisibleFeedIds
      , bannedByJupiterUserIds
      , saturnPosts
      , marsPosts

    beforeEach(async () => {
      luna    = new User({ username: 'Luna', password: 'password' })
      mars    = new User({ username: 'Mars', password: 'password' })
      jupiter = new User({ username: 'Jupiter', password: 'password' })
      saturn  = new User({ username: 'Saturn', password: 'password' })

      await Promise.all([luna.create(), mars.create(), jupiter.create(), saturn.create()])
      await luna.update({ isPrivate: '1' })
      await saturn.update({ isVisibleToAnonymous: '0' })

      lunaVisibleFeedIds = (await dbAdapter.getUserById(luna.id)).subscribedFeedIds
      bannedByLunaUserIds = await luna.getBanIds()

      marsVisibleFeedIds = (await dbAdapter.getUserById(mars.id)).subscribedFeedIds
      bannedByMarsUserIds = await mars.getBanIds()

      lunaPosts = []
      for (const body of lunaPostsContent) {
        const post = await luna.newPost({ body })  // eslint-disable-line babel/no-await-in-loop
        lunaPosts.push(await post.create())  // eslint-disable-line babel/no-await-in-loop
      }
      saturnPosts = []
      for (const body of saturnPostsContent) {
        const post = await saturn.newPost({ body })  // eslint-disable-line babel/no-await-in-loop
        saturnPosts.push(await post.create())  // eslint-disable-line babel/no-await-in-loop
      }
      marsPosts = []
      for (const body of marsPostsContent) {
        const post = await mars.newPost({ body })  // eslint-disable-line babel/no-await-in-loop
        marsPosts.push(await post.create())  // eslint-disable-line babel/no-await-in-loop
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

    describe('Saturn doesn\'t like people who are not logged in', () => {
      beforeEach(async () => {
        marsVisibleFeedIds = (await dbAdapter.getUserById(mars.id)).subscribedFeedIds
        jupiterVisibleFeedIds = (await dbAdapter.getUserById(jupiter.id)).subscribedFeedIds
        bannedByJupiterUserIds = await jupiter.getBanIds()
      })

      it("Mars can find Saturn's posts", async () => {
        const query = SearchQueryParser.parse('gigantic')

        const searchResults = await dbAdapter.searchPosts(query, mars.id, marsVisibleFeedIds, bannedByMarsUserIds, 0, 30)
        searchResults.should.not.be.empty
        searchResults.length.should.eql(1)
        searchResults[0].should.have.property('uid')
        searchResults[0].uid.should.eql(saturnPosts[2].id)
        searchResults[0].should.have.property('body')
        searchResults[0].body.should.eql(saturnPosts[2].body)
      })

      it("Uranus can't find Saturn's posts", async () => {
        const query = SearchQueryParser.parse('gigantic')

        const searchResults = await dbAdapter.searchPosts(query, null, [], [], 0, 30)
        searchResults.should.be.empty
      })

      it("Uranus can find Mars' posts", async () => {
        const query = SearchQueryParser.parse('icicle')

        const searchResults = await dbAdapter.searchPosts(query, null, [], [], 0, 30)
        searchResults.should.not.be.empty
        searchResults.length.should.eql(1)
        searchResults[0].should.have.property('uid')
        searchResults[0].uid.should.eql(marsPosts[1].id)
        searchResults[0].should.have.property('body')
        searchResults[0].body.should.eql(marsPosts[1].body)
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

  describe('banned users content', () => {
    let luna
      , mars
      , jupiter
      , post;

    const _becomeFriends = async (user1, user2) => {
      const [user1TimelineId, user2TimelineId] = await Promise.all([
        user1.getPostsTimelineId(),
        user2.getPostsTimelineId()
      ]);

      await user1.subscribeTo(user2TimelineId);
      return user2.subscribeTo(user1TimelineId);
    }

    const _createPost = async (author, text) => {
      post = await author.newPost({ body: text });
      return post.create();
    }

    const _createGroupPost = async (author, groupPostsFeedId, text) => {
      post = await author.newPost({ body: text, timelineIds: [groupPostsFeedId] });
      return post.create();
    }

    const _createComment = async (commenter, commentBody, post) => {
      const comment = await commenter.newComment({
        body:   commentBody,
        postId: post.id
      });

      return comment.create();
    }

    beforeEach(async () => {
      luna = new User({ username: 'Luna', password: 'password' });
      mars = new User({ username: 'Mars', password: 'password' });
      jupiter = new User({ username: 'Jupiter', password: 'password' });

      await luna.create();
      await mars.create();
      await jupiter.create();
    });

    describe('public posts search', () => {
      const _searchPublicPosts = async (term, viewer) => {
        const bannedUserIds = await viewer.getBanIds();

        const query = SearchQueryParser.parse(term);
        return dbAdapter.searchPosts(query, null, [], bannedUserIds, 0, 30);
      };

      describe('full text search', () => {
        it('should not find post from banned user', async () => {
          await _createPost(mars, 'Lazy green fox jumps over the lazy dog');

          await luna.ban('mars');

          const searchResults = await _searchPublicPosts('fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by banned user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(mars, 'Lazy green fox jumps over the lazy dog', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicPosts('fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by other user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(jupiter, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicPosts('fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by viewer's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(luna, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicPosts('fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find visible post by banned user's comment match", async () => {
          await _createPost(jupiter, 'Lazy sloth');
          await _createComment(mars, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicPosts('fox', luna);
          searchResults.length.should.eql(0);
        });
      })

      describe('exact match search', () => {
        it('should not find post from banned user', async () => {
          await _createPost(mars, 'Lazy green fox jumps over the lazy dog');

          await luna.ban('mars');

          const searchResults = await _searchPublicPosts('"fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by banned user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(mars, 'Lazy green fox jumps over the lazy dog', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicPosts('"fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by other user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(jupiter, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicPosts('"fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by viewer's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(luna, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicPosts('"fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find visible post by banned user's comment match", async () => {
          await _createPost(jupiter, 'Lazy sloth');
          await _createComment(mars, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicPosts('"fox"', luna);
          searchResults.length.should.eql(0);
        });
      })

      describe('hashtag search', () => {
        it('should not find post from banned user', async () => {
          await _createPost(mars, 'Lazy green #fox jumps over the lazy dog');

          await luna.ban('mars');

          const searchResults = await _searchPublicPosts('#fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by banned user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(mars, 'Lazy green #fox jumps over the lazy dog', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicPosts('#fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by other user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(jupiter, 'Very lazy #fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicPosts('#fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by viewer's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(luna, 'Very lazy #fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicPosts('#fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find visible post by banned user's comment match", async () => {
          await _createPost(jupiter, 'Lazy sloth');
          await _createComment(mars, 'Very lazy #fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicPosts('#fox', luna);
          searchResults.length.should.eql(0);
        });
      })
    })

    describe('private posts search', () => {
      beforeEach(async () => {
        await _becomeFriends(luna, mars);
        await _becomeFriends(luna, jupiter);
        await _becomeFriends(jupiter, mars);

        await luna.update({ isPrivate: '1' });
        await mars.update({ isPrivate: '1' });
        await jupiter.update({ isPrivate: '1' });
      });

      const _searchPrivatePosts = async (term, viewer) => {
        const visibleFeedIds = (await dbAdapter.getUserById(viewer.id)).subscribedFeedIds;
        const bannedUserIds = await viewer.getBanIds();

        const query = SearchQueryParser.parse(term);
        return dbAdapter.searchPosts(query, viewer.id, visibleFeedIds, bannedUserIds, 0, 30);
      };

      describe('full text search', () => {
        it('should not find post from banned user', async () => {
          await _createPost(mars, 'Lazy green fox jumps over the lazy dog');

          await luna.ban('mars');

          const searchResults = await _searchPrivatePosts('fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by banned user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(mars, 'Lazy green fox jumps over the lazy dog', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivatePosts('fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by other user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(jupiter, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivatePosts('fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by viewer's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(luna, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivatePosts('fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find visible post by banned user's comment match", async () => {
          await _createPost(jupiter, 'Lazy sloth');
          await _createComment(mars, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivatePosts('fox', luna);
          searchResults.length.should.eql(0);
        });
      })

      describe('exact match search', () => {
        it('should not find post from banned user', async () => {
          await _createPost(mars, 'Lazy green fox jumps over the lazy dog');

          await luna.ban('mars');

          const searchResults = await _searchPrivatePosts('"fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by banned user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(mars, 'Lazy green fox jumps over the lazy dog', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivatePosts('"fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by other user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(jupiter, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivatePosts('"fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by viewer's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(luna, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivatePosts('"fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find visible post by banned user's comment match", async () => {
          await _createPost(jupiter, 'Lazy sloth');
          await _createComment(mars, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivatePosts('"fox"', luna);
          searchResults.length.should.eql(0);
        });
      })

      describe('hashtag search', () => {
        it('should not find post from banned user', async () => {
          await _createPost(mars, 'Lazy green #fox jumps over the lazy dog');

          await luna.ban('mars');

          const searchResults = await _searchPrivatePosts('#fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by banned user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(mars, 'Lazy green #fox jumps over the lazy dog', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivatePosts('#fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by other user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(jupiter, 'Very lazy #fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivatePosts('#fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by viewer's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(luna, 'Very lazy #fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivatePosts('#fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find visible post by banned user's comment match", async () => {
          await _createPost(jupiter, 'Lazy sloth');
          await _createComment(mars, 'Very lazy #fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivatePosts('#fox', luna);
          searchResults.length.should.eql(0);
        });
      })
    })

    describe('public posts search with specified author', () => {
      const _searchPublicUserPosts = async (term, viewer) => {
        const bannedUserIds = await viewer.getBanIds();

        const query = SearchQueryParser.parse(term);
        const targetUser = await dbAdapter.getUserByUsername(query.username);
        return dbAdapter.searchUserPosts(query, targetUser.id, [], bannedUserIds, 0, 30);
      };

      describe('full text search', () => {
        it('should not find post from banned user', async () => {
          await _createPost(mars, 'Lazy green fox jumps over the lazy dog');

          await luna.ban('mars');

          const searchResults = await _searchPublicUserPosts('from: mars fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by banned user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(mars, 'Lazy green fox jumps over the lazy dog', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicUserPosts('from: mars fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by other user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(jupiter, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicUserPosts('from: mars fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by viewer's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(luna, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicUserPosts('from: mars fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find visible post by banned user's comment match", async () => {
          await _createPost(jupiter, 'Lazy sloth');
          await _createComment(mars, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicUserPosts('from: jupiter fox', luna);
          searchResults.length.should.eql(0);
        });
      })

      describe('exact match search', () => {
        it('should not find post from banned user', async () => {
          await _createPost(mars, 'Lazy green fox jumps over the lazy dog');

          await luna.ban('mars');

          const searchResults = await _searchPublicUserPosts('from: mars "fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by banned user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(mars, 'Lazy green fox jumps over the lazy dog', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicUserPosts('from: mars "fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by other user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(jupiter, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicUserPosts('from: mars "fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by viewer's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(luna, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicUserPosts('from: mars "fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find visible post by banned user's comment match", async () => {
          await _createPost(jupiter, 'Lazy sloth');
          await _createComment(mars, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicUserPosts('from: mars "fox"', luna);
          searchResults.length.should.eql(0);
        });
      })

      describe('hashtag search', () => {
        it('should not find post from banned user', async () => {
          await _createPost(mars, 'Lazy green #fox jumps over the lazy dog');

          await luna.ban('mars');

          const searchResults = await _searchPublicUserPosts('from: mars #fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by banned user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(mars, 'Lazy green #fox jumps over the lazy dog', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicUserPosts('from: mars #fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by other user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(jupiter, 'Very lazy #fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicUserPosts('from: mars #fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by viewer's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(luna, 'Very lazy #fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicUserPosts('from: mars #fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find visible post by banned user's comment match", async () => {
          await _createPost(jupiter, 'Lazy sloth');
          await _createComment(mars, 'Very lazy #fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicUserPosts('from: mars #fox', luna);
          searchResults.length.should.eql(0);
        });
      })
    })

    describe('private posts search with specified author', () => {
      beforeEach(async () => {
        await _becomeFriends(luna, mars);
        await _becomeFriends(luna, jupiter);
        await _becomeFriends(jupiter, mars);

        await luna.update({ isPrivate: '1' });
        await mars.update({ isPrivate: '1' });
        await jupiter.update({ isPrivate: '1' });
      });

      const _searchPrivateUserPosts = async (term, viewer) => {
        const visibleFeedIds = (await dbAdapter.getUserById(viewer.id)).subscribedFeedIds;
        const bannedUserIds = await viewer.getBanIds();

        const query = SearchQueryParser.parse(term);
        const targetUser = await dbAdapter.getUserByUsername(query.username);
        return dbAdapter.searchUserPosts(query, targetUser.id, visibleFeedIds, bannedUserIds, 0, 30);
      };

      describe('full text search', () => {
        it('should not find post from banned user', async () => {
          await _createPost(mars, 'Lazy green fox jumps over the lazy dog');

          await luna.ban('mars');

          const searchResults = await _searchPrivateUserPosts('from: mars fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by banned user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(mars, 'Lazy green fox jumps over the lazy dog', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateUserPosts('from: mars fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by other user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(jupiter, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateUserPosts('from: mars fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by viewer's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(luna, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateUserPosts('from: mars fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find visible post by banned user's comment match", async () => {
          await _createPost(jupiter, 'Lazy sloth');
          await _createComment(mars, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateUserPosts('from: jupiter fox', luna);
          searchResults.length.should.eql(0);
        });
      })

      describe('exact match search', () => {
        it('should not find post from banned user', async () => {
          await _createPost(mars, 'Lazy green fox jumps over the lazy dog');

          await luna.ban('mars');

          const searchResults = await _searchPrivateUserPosts('from: mars "fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by banned user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(mars, 'Lazy green fox jumps over the lazy dog', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateUserPosts('from: mars "fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by other user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(jupiter, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateUserPosts('from: mars "fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by viewer's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(luna, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateUserPosts('from: mars "fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find visible post by banned user's comment match", async () => {
          await _createPost(jupiter, 'Lazy sloth');
          await _createComment(mars, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateUserPosts('from: mars "fox"', luna);
          searchResults.length.should.eql(0);
        });
      })

      describe('hashtag search', () => {
        it('should not find post from banned user', async () => {
          await _createPost(mars, 'Lazy green #fox jumps over the lazy dog');

          await luna.ban('mars');

          const searchResults = await _searchPrivateUserPosts('from: mars #fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by banned user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(mars, 'Lazy green #fox jumps over the lazy dog', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateUserPosts('from: mars #fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by other user's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(jupiter, 'Very lazy #fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateUserPosts('from: mars #fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by viewer's comment match", async () => {
          await _createPost(mars, 'Lazy sloth');
          await _createComment(luna, 'Very lazy #fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateUserPosts('from: mars #fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find visible post by banned user's comment match", async () => {
          await _createPost(jupiter, 'Lazy sloth');
          await _createComment(mars, 'Very lazy #fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateUserPosts('from: mars #fox', luna);
          searchResults.length.should.eql(0);
        });
      })
    })

    describe('public posts search with specified group', () => {
      let group
        , groupTimelineId;
      beforeEach(async () => {
        group = new Group({ username: 'search-dev' });
        await group.create(luna.id, false);
        groupTimelineId = await group.getPostsTimelineId();
        await mars.subscribeTo(groupTimelineId);
        return jupiter.subscribeTo(groupTimelineId);
      });

      const _searchPublicGroupPosts = async (term, viewer) => {
        const bannedUserIds = await viewer.getBanIds();

        const query = SearchQueryParser.parse(term);
        const targetGroup = await dbAdapter.getGroupByUsername(query.group);
        const groupPostsFeedId = await targetGroup.getPostsTimelineId();
        return dbAdapter.searchGroupPosts(query, groupPostsFeedId, [], bannedUserIds, 0, 30);
      };

      describe('full text search', () => {
        it('should not find post from banned user', async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy green fox jumps over the lazy dog');

          await luna.ban('mars');

          const searchResults = await _searchPublicGroupPosts('group: search-dev fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by banned user's comment match", async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(mars, 'Lazy green fox jumps over the lazy dog', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicGroupPosts('group: search-dev fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by other user's comment match", async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(jupiter, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicGroupPosts('group: search-dev fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by viewer's comment match", async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(luna, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicGroupPosts('group: search-dev fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find visible post by banned user's comment match", async () => {
          await _createGroupPost(jupiter, groupTimelineId, 'Lazy sloth');
          await _createComment(mars, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicGroupPosts('group: search-dev fox', luna);
          searchResults.length.should.eql(0);
        });
      })

      describe('exact match search', () => {
        it('should not find post from banned user', async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy green fox jumps over the lazy dog');

          await luna.ban('mars');

          const searchResults = await _searchPublicGroupPosts('group: search-dev "fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by banned user's comment match", async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(mars, 'Lazy green fox jumps over the lazy dog', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicGroupPosts('group: search-dev "fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by other user's comment match", async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(jupiter, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicGroupPosts('group: search-dev "fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by viewer's comment match", async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(luna, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicGroupPosts('group: search-dev "fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find visible post by banned user's comment match", async () => {
          await _createGroupPost(jupiter, groupTimelineId, 'Lazy sloth');
          await _createComment(mars, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicGroupPosts('group: search-dev "fox"', luna);
          searchResults.length.should.eql(0);
        });
      })

      describe('hashtag search', () => {
        it('should not find post from banned user', async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy green #fox jumps over the lazy dog');

          await luna.ban('mars');

          const searchResults = await _searchPublicGroupPosts('group: search-dev #fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by banned user's comment match", async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(mars, 'Lazy green #fox jumps over the lazy dog', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicGroupPosts('group: search-dev #fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by other user's comment match", async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(jupiter, 'Very lazy #fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicGroupPosts('group: search-dev #fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by viewer's comment match", async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(luna, 'Very lazy #fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicGroupPosts('group: search-dev #fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find visible post by banned user's comment match", async () => {
          await _createGroupPost(jupiter, groupTimelineId, 'Lazy sloth');
          await _createComment(mars, 'Very lazy #fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPublicGroupPosts('group: search-dev #fox', luna);
          searchResults.length.should.eql(0);
        });
      })
    })

    describe('private posts search with specified group', () => {
      let group
        , groupTimelineId;
      beforeEach(async () => {
        group = new Group({ username: 'search-dev', isPrivate: '1' });
        await group.create(luna.id, false);
        groupTimelineId = await group.getPostsTimelineId();
        await mars.subscribeTo(groupTimelineId);
        return jupiter.subscribeTo(groupTimelineId);
      });

      const _searchPrivateGroupPosts = async (term, viewer) => {
        const visibleFeedIds = (await dbAdapter.getUserById(viewer.id)).subscribedFeedIds;
        const bannedUserIds = await viewer.getBanIds();

        const query = SearchQueryParser.parse(term);
        const targetGroup = await dbAdapter.getGroupByUsername(query.group);
        const groupPostsFeedId = await targetGroup.getPostsTimelineId();
        return dbAdapter.searchGroupPosts(query, groupPostsFeedId, visibleFeedIds, bannedUserIds, 0, 30);
      };

      describe('full text search', () => {
        it('should not find post from banned user', async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy green fox jumps over the lazy dog');

          await luna.ban('mars');

          const searchResults = await _searchPrivateGroupPosts('group: search-dev fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by banned user's comment match", async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(mars, 'Lazy green fox jumps over the lazy dog', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateGroupPosts('group: search-dev fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by other user's comment match", async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(jupiter, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateGroupPosts('group: search-dev fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by viewer's comment match", async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(luna, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateGroupPosts('group: search-dev fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find visible post by banned user's comment match", async () => {
          await _createGroupPost(jupiter, groupTimelineId, 'Lazy sloth');
          await _createComment(mars, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateGroupPosts('group: search-dev fox', luna);
          searchResults.length.should.eql(0);
        });
      })

      describe('exact match search', () => {
        it('should not find post from banned user', async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy green fox jumps over the lazy dog');

          await luna.ban('mars');

          const searchResults = await _searchPrivateGroupPosts('group: search-dev "fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by banned user's comment match", async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(mars, 'Lazy green fox jumps over the lazy dog', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateGroupPosts('group: search-dev "fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by other user's comment match", async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(jupiter, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateGroupPosts('group: search-dev "fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by viewer's comment match", async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(luna, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateGroupPosts('group: search-dev "fox"', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find visible post by banned user's comment match", async () => {
          await _createGroupPost(jupiter, groupTimelineId, 'Lazy sloth');
          await _createComment(mars, 'Very lazy fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateGroupPosts('group: search-dev "fox"', luna);
          searchResults.length.should.eql(0);
        });
      })

      describe('hashtag search', () => {
        it('should not find post from banned user', async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy green #fox jumps over the lazy dog');

          await luna.ban('mars');

          const searchResults = await _searchPrivateGroupPosts('group: search-dev #fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by banned user's comment match", async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(mars, 'Lazy green #fox jumps over the lazy dog', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateGroupPosts('group: search-dev #fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by other user's comment match", async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(jupiter, 'Very lazy #fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateGroupPosts('group: search-dev #fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find post from banned user by viewer's comment match", async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(luna, 'Very lazy #fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateGroupPosts('group: search-dev #fox', luna);
          searchResults.length.should.eql(0);
        });

        it("should not find visible post by banned user's comment match", async () => {
          await _createGroupPost(jupiter, groupTimelineId, 'Lazy sloth');
          await _createComment(mars, 'Very lazy #fox', post);

          await luna.ban('mars');

          const searchResults = await _searchPrivateGroupPosts('group: search-dev #fox', luna);
          searchResults.length.should.eql(0);
        });
      })
    })
  })

  describe('group post search', () => {
    let luna
      , mars
      , jupiter
      , post;

    const _createGroupPost = async (author, groupPostsFeedId, text) => {
      post = await author.newPost({ body: text, timelineIds: [groupPostsFeedId] });
      return post.create();
    }

    const _createComment = async (commenter, commentBody, post) => {
      const comment = await commenter.newComment({
        body:   commentBody,
        postId: post.id
      });

      return comment.create();
    }

    beforeEach(async () => {
      luna = new User({ username: 'Luna', password: 'password' });
      mars = new User({ username: 'Mars', password: 'password' });
      jupiter = new User({ username: 'Jupiter', password: 'password' });

      await luna.create();
      await mars.create();
      await jupiter.create();
    });

    describe('public posts search with specified group', () => {
      let group
        , groupTimelineId;
      beforeEach(async () => {
        group = new Group({ username: 'search-dev' });
        await group.create(luna.id, false);
        groupTimelineId = await group.getPostsTimelineId();
        return mars.subscribeTo(groupTimelineId);
      });

      const _searchPublicGroupPosts = async (term, viewer) => {
        const bannedUserIds = await viewer.getBanIds();

        const query = SearchQueryParser.parse(term);
        const targetGroup = await dbAdapter.getGroupByUsername(query.group);
        const groupPostsFeedId = await targetGroup.getPostsTimelineId();
        return dbAdapter.searchGroupPosts(query, groupPostsFeedId, [], bannedUserIds, 0, 30);
      };

      describe('full text search', () => {
        it('should find post in specified group', async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy green fox jumps over the lazy dog');

          const searchResults = await _searchPublicGroupPosts('group: search-dev fox', luna);
          searchResults.length.should.eql(1);
          searchResults[0].body.should.eql(post.body);
        });

        it('should find post in specified group by comment match', async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(mars, 'Lazy green fox jumps over the lazy dog', post);

          const searchResults = await _searchPublicGroupPosts('group: search-dev fox', luna);
          searchResults.length.should.eql(1);
          searchResults[0].body.should.eql(post.body);
        });

        it("should find post in specified group by viewer's comment match", async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(luna, 'Very lazy fox', post);

          const searchResults = await _searchPublicGroupPosts('group: search-dev fox', luna);
          searchResults.length.should.eql(1);
          searchResults[0].body.should.eql(post.body);
        });

        it('should find post only in specified group', async () => {
          const group2 = new Group({ username: 'search-dev2' });
          await group2.create(luna.id, false);
          const group2TimelineId = await group2.getPostsTimelineId();
          await mars.subscribeTo(group2TimelineId);

          await _createGroupPost(mars, group2TimelineId, 'Lazy green fox jumps over the lazy pig');
          await _createGroupPost(mars, groupTimelineId, 'Lazy green fox jumps over the lazy dog');

          const searchResults = await _searchPublicGroupPosts('group: search-dev fox', luna);
          searchResults.length.should.eql(1);
          searchResults[0].body.should.eql(post.body);
        });
      })

      describe('exact match search', () => {
        it('should find post in specified group', async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy green fox jumps over the lazy dog');

          const searchResults = await _searchPublicGroupPosts('group: search-dev "fox"', luna);
          searchResults.length.should.eql(1);
          searchResults[0].body.should.eql(post.body);
        });

        it('should find post in specified group by comment match', async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(mars, 'Lazy green fox jumps over the lazy dog', post);

          const searchResults = await _searchPublicGroupPosts('group: search-dev "fox"', luna);
          searchResults.length.should.eql(1);
          searchResults[0].body.should.eql(post.body);
        });

        it("should find post in specified group by viewer's comment match", async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(luna, 'Very lazy fox', post);

          const searchResults = await _searchPublicGroupPosts('group: search-dev "fox"', luna);
          searchResults.length.should.eql(1);
          searchResults[0].body.should.eql(post.body);
        });

        it('should find post only in specified group', async () => {
          const group2 = new Group({ username: 'search-dev2' });
          await group2.create(luna.id, false);
          const group2TimelineId = await group2.getPostsTimelineId();
          await mars.subscribeTo(group2TimelineId);

          await _createGroupPost(mars, group2TimelineId, 'Lazy green fox jumps over the lazy pig');
          await _createGroupPost(mars, groupTimelineId, 'Lazy green fox jumps over the lazy dog');

          const searchResults = await _searchPublicGroupPosts('group: search-dev "fox"', luna);
          searchResults.length.should.eql(1);
          searchResults[0].body.should.eql(post.body);
        });
      })

      describe('hashtag search', () => {
        it('should find post in specified group', async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy green #fox jumps over the lazy dog');

          const searchResults = await _searchPublicGroupPosts('group: search-dev #fox', luna);
          searchResults.length.should.eql(1);
          searchResults[0].body.should.eql(post.body);
        });

        it('should find post in specified group by comment match', async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(mars, 'Lazy green #fox jumps over the lazy dog', post);

          const searchResults = await _searchPublicGroupPosts('group: search-dev #fox', luna);
          searchResults.length.should.eql(1);
          searchResults[0].body.should.eql(post.body);
        });

        it("should find post in specified group by viewer's comment match", async () => {
          await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
          await _createComment(luna, 'Very lazy #fox', post);

          const searchResults = await _searchPublicGroupPosts('group: search-dev #fox', luna);
          searchResults.length.should.eql(1);
          searchResults[0].body.should.eql(post.body);
        });

        it('should find post only in specified group', async () => {
          const group2 = new Group({ username: 'search-dev2' });
          await group2.create(luna.id, false);
          const group2TimelineId = await group2.getPostsTimelineId();
          await mars.subscribeTo(group2TimelineId);

          await _createGroupPost(mars, group2TimelineId, 'Lazy green #fox jumps over the lazy pig');
          await _createGroupPost(mars, groupTimelineId, 'Lazy green #fox jumps over the lazy dog');

          const searchResults = await _searchPublicGroupPosts('group: search-dev #fox', luna);
          searchResults.length.should.eql(1);
          searchResults[0].body.should.eql(post.body);
        });
      })
    })

    describe('private posts search with specified group', () => {
      let group
        , groupTimelineId;
      beforeEach(async () => {
        group = new Group({ username: 'search-dev', isPrivate: '1' });
        await group.create(luna.id, false);
        groupTimelineId = await group.getPostsTimelineId();
        return mars.subscribeTo(groupTimelineId);
      });

      const _searchPrivateGroupPosts = async (term, viewer) => {
        const visibleFeedIds = (await dbAdapter.getUserById(viewer.id)).subscribedFeedIds;
        const bannedUserIds = await viewer.getBanIds();

        const query = SearchQueryParser.parse(term);
        const targetGroup = await dbAdapter.getGroupByUsername(query.group);
        const groupPostsFeedId = await targetGroup.getPostsTimelineId();
        return dbAdapter.searchGroupPosts(query, groupPostsFeedId, visibleFeedIds, bannedUserIds, 0, 30);
      };

      describe('full text search', () => {
        describe('for group subscribers', () => {
          it('should find post in specified group', async () => {
            await _createGroupPost(mars, groupTimelineId, 'Lazy green fox jumps over the lazy dog');

            const searchResults = await _searchPrivateGroupPosts('group: search-dev fox', luna);
            searchResults.length.should.eql(1);
            searchResults[0].body.should.eql(post.body);
          });

          it('should find post in specified group by comment match', async () => {
            await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
            await _createComment(mars, 'Lazy green fox jumps over the lazy dog', post);

            const searchResults = await _searchPrivateGroupPosts('group: search-dev fox', luna);
            searchResults.length.should.eql(1);
            searchResults[0].body.should.eql(post.body);
          });

          it("should find post in specified group by viewer's comment match", async () => {
            await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
            await _createComment(luna, 'Very lazy fox', post);

            const searchResults = await _searchPrivateGroupPosts('group: search-dev fox', luna);
            searchResults.length.should.eql(1);
            searchResults[0].body.should.eql(post.body);
          });

          it('should find post only in specified group', async () => {
            const group2 = new Group({ username: 'search-dev2' });
            await group2.create(luna.id, false);
            const group2TimelineId = await group2.getPostsTimelineId();
            await mars.subscribeTo(group2TimelineId);
            await jupiter.subscribeTo(group2TimelineId);

            await _createGroupPost(mars, group2TimelineId, 'Lazy green fox jumps over the lazy pig');
            await _createGroupPost(mars, groupTimelineId, 'Lazy green fox jumps over the lazy dog');

            const searchResults = await _searchPrivateGroupPosts('group: search-dev fox', luna);
            searchResults.length.should.eql(1);
            searchResults[0].body.should.eql(post.body);
          });
        })

        describe('for non-subscribers', () => {
          it('should not find post in specified group', async () => {
            await _createGroupPost(mars, groupTimelineId, 'Lazy green fox jumps over the lazy dog');

            const searchResults = await _searchPrivateGroupPosts('group: search-dev fox', jupiter);
            searchResults.length.should.eql(0);
          });

          it('should not find post in specified group by comment match', async () => {
            await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
            await _createComment(mars, 'Lazy green fox jumps over the lazy dog', post);

            const searchResults = await _searchPrivateGroupPosts('group: search-dev fox', jupiter);
            searchResults.length.should.eql(0);
          });
        })
      })

      describe('exact match search', () => {
        describe('for group subscribers', () => {
          it('should find post in specified group', async () => {
            await _createGroupPost(mars, groupTimelineId, 'Lazy green fox jumps over the lazy dog');

            const searchResults = await _searchPrivateGroupPosts('group: search-dev "fox"', luna);
            searchResults.length.should.eql(1);
            searchResults[0].body.should.eql(post.body);
          });

          it('should find post in specified group by comment match', async () => {
            await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
            await _createComment(mars, 'Lazy green fox jumps over the lazy dog', post);

            const searchResults = await _searchPrivateGroupPosts('group: search-dev "fox"', luna);
            searchResults.length.should.eql(1);
            searchResults[0].body.should.eql(post.body);
          });

          it("should find post in specified group by viewer's comment match", async () => {
            await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
            await _createComment(luna, 'Very lazy fox', post);

            const searchResults = await _searchPrivateGroupPosts('group: search-dev "fox"', luna);
            searchResults.length.should.eql(1);
            searchResults[0].body.should.eql(post.body);
          });

          it('should find post only in specified group', async () => {
            const group2 = new Group({ username: 'search-dev2' });
            await group2.create(luna.id, false);
            const group2TimelineId = await group2.getPostsTimelineId();
            await mars.subscribeTo(group2TimelineId);
            await jupiter.subscribeTo(group2TimelineId);

            await _createGroupPost(mars, group2TimelineId, 'Lazy green fox jumps over the lazy pig');
            await _createGroupPost(mars, groupTimelineId, 'Lazy green fox jumps over the lazy dog');

            const searchResults = await _searchPrivateGroupPosts('group: search-dev "fox"', luna);
            searchResults.length.should.eql(1);
            searchResults[0].body.should.eql(post.body);
          });
        })

        describe('for non-subscribers', () => {
          it('should not find post in specified group', async () => {
            await _createGroupPost(mars, groupTimelineId, 'Lazy green fox jumps over the lazy dog');

            const searchResults = await _searchPrivateGroupPosts('group: search-dev "fox"', jupiter);
            searchResults.length.should.eql(0);
          });

          it('should not find post in specified group by comment match', async () => {
            await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
            await _createComment(mars, 'Lazy green fox jumps over the lazy dog', post);

            const searchResults = await _searchPrivateGroupPosts('group: search-dev "fox"', jupiter);
            searchResults.length.should.eql(0);
          });
        })
      })

      describe('hashtag search', () => {
        describe('for group subscribers', () => {
          it('should find post in specified group', async () => {
            await _createGroupPost(mars, groupTimelineId, 'Lazy green #fox jumps over the lazy dog');

            const searchResults = await _searchPrivateGroupPosts('group: search-dev #fox', luna);
            searchResults.length.should.eql(1);
            searchResults[0].body.should.eql(post.body);
          });

          it('should find post in specified group by comment match', async () => {
            await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
            await _createComment(mars, 'Lazy green #fox jumps over the lazy dog', post);

            const searchResults = await _searchPrivateGroupPosts('group: search-dev #fox', luna);
            searchResults.length.should.eql(1);
            searchResults[0].body.should.eql(post.body);
          });

          it("should find post in specified group by viewer's comment match", async () => {
            await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
            await _createComment(luna, 'Very lazy #fox', post);

            const searchResults = await _searchPrivateGroupPosts('group: search-dev #fox', luna);
            searchResults.length.should.eql(1);
            searchResults[0].body.should.eql(post.body);
          });

          it('should find post only in specified group', async () => {
            const group2 = new Group({ username: 'search-dev2' });
            await group2.create(luna.id, false);
            const group2TimelineId = await group2.getPostsTimelineId();
            await mars.subscribeTo(group2TimelineId);
            await jupiter.subscribeTo(group2TimelineId);

            await _createGroupPost(mars, group2TimelineId, 'Lazy green #fox jumps over the lazy pig');
            await _createGroupPost(mars, groupTimelineId, 'Lazy green #fox jumps over the lazy dog');

            const searchResults = await _searchPrivateGroupPosts('group: search-dev #fox', luna);
            searchResults.length.should.eql(1);
            searchResults[0].body.should.eql(post.body);
          });
        })

        describe('for non-subscribers', () => {
          it('should not find post in specified group', async () => {
            await _createGroupPost(mars, groupTimelineId, 'Lazy green #fox jumps over the lazy dog');

            const searchResults = await _searchPrivateGroupPosts('group: search-dev #fox', jupiter);
            searchResults.length.should.eql(0);
          });

          it('should not find post in specified group by comment match', async () => {
            await _createGroupPost(mars, groupTimelineId, 'Lazy sloth');
            await _createComment(mars, 'Lazy green #fox jumps over the lazy dog', post);

            const searchResults = await _searchPrivateGroupPosts('group: search-dev #fox', jupiter);
            searchResults.length.should.eql(0);
          });
        })
      })
    })
  })
});
