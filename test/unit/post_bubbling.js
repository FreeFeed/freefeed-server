/* eslint-env node, mocha */
/* global $pg_database */
import knexCleaner from 'knex-cleaner'
import { User, Group } from '../../app/models'


describe('PostBubbling', () => {
  beforeEach(async () => {
    await knexCleaner.clean($pg_database)
  })

  const homeFeedEqualTo = async (user, expectedContent, feedReaderId) => {
    const homeFeed = await user.getRiverOfNewsTimeline({ currentUser: feedReaderId })
    const posts = await homeFeed.getPosts()

    posts.should.not.be.empty
    posts.length.should.eql(expectedContent.length)
    const homeFeedContent = posts.map((p) => {
      return p.body
    }).join(',')
    homeFeedContent.should.eql(expectedContent.join(','))
  }

  const homeFeedPageEqualTo = async (user, expectedContent, feedReaderId, limit, offset) => {
    const homeFeed = await user.getRiverOfNewsTimeline({ currentUser: feedReaderId })
    const posts = await homeFeed.getPosts(offset, limit)

    posts.should.not.be.empty
    posts.length.should.eql(expectedContent.length)
    const homeFeedContent = posts.map((p) => {
      return p.body
    }).join(',')
    homeFeedContent.should.eql(expectedContent.join(','))
  }

  const addCommentToPost = (commenter, post, content) => {
    const commentAttrs = {
      body:   content,
      postId: post.id
    }

    const comment = commenter.newComment(commentAttrs)
    return comment.create()
  }


  describe('public users Luna, Mars and stranger Jupiter', () => {
    const lunaPostsContent = ['A', 'B', 'C']
        , marsPostsContent = ['Able', 'Baker', 'Charlie', 'Dog']
    let luna
      , mars
      , jupiter
      , lunaPosts
      , marsPosts

    beforeEach(async () => {
      luna = new User({ username: 'Luna', password: 'password' })
      mars = new User({ username: 'Mars', password: 'password' })
      jupiter = new User({ username: 'Jupiter', password: 'password' })

      await Promise.all([luna.create(), mars.create(), jupiter.create()]);

      lunaPosts = []
      for (const body of lunaPostsContent) {
        const post = await luna.newPost({ body })  // eslint-disable-line babel/no-await-in-loop
        lunaPosts.push(await post.create())  // eslint-disable-line babel/no-await-in-loop
      }

      marsPosts = []
      for (const body of marsPostsContent) {
        const post = await mars.newPost({ body })  // eslint-disable-line babel/no-await-in-loop
        marsPosts.push(await post.create())  // eslint-disable-line babel/no-await-in-loop
      }
    })

    describe('Luna and Mars are not friends', () => {
      it('Home feed of Luna contains posts in reverse chronological order', async () => {
        const expectedContent = [...lunaPostsContent].reverse()
        await homeFeedEqualTo(luna, expectedContent, luna.id)
      })

      describe('Luna likes Mars post', () => {
        it("brings post to the top of Luna's home feed", async () => {
          await marsPosts[0].addLike(luna)
          const expectedContent = ['Able'].concat([...lunaPostsContent].reverse())
          await homeFeedEqualTo(luna, expectedContent, luna.id)
        })

        it("not changes posts order in Mars's home feed", async () => {
          await marsPosts[0].addLike(luna)
          const expectedContent = [...marsPostsContent].reverse()
          await homeFeedEqualTo(mars, expectedContent, mars.id)
        })
      })

      describe('Luna comments Mars post', () => {
        it("brings post to the top of Luna's home feed", async () => {
          await addCommentToPost(luna, marsPosts[0], 'Victor')
          const expectedContent = ['Able'].concat([...lunaPostsContent].reverse())
          await homeFeedEqualTo(luna, expectedContent, luna.id)
        })

        it("brings post to the top of Mars's home feed", async () => {
          await addCommentToPost(luna, marsPosts[0], 'Uncle')
          const expectedContent = ['Able', 'Dog', 'Charlie', 'Baker']
          await homeFeedEqualTo(mars, expectedContent, mars.id)
        })
      })

      describe('Luna comments own post', () => {
        it("brings post to the top of Luna's home feed", async () => {
          await addCommentToPost(luna, lunaPosts[0], 'Sail')
          const expectedContent = ['A', 'C', 'B']
          await homeFeedEqualTo(luna, expectedContent, luna.id)
        })

        it('not changes posts order in Mars home feed', async () => {
          await addCommentToPost(luna, lunaPosts[0], 'Sugar')
          const expectedContent = [...marsPostsContent].reverse()
          await homeFeedEqualTo(mars, expectedContent, mars.id)
        })
      })

      describe('Jupiter likes Mars post', () => {
        it("not changes posts order in Luna's home feed", async () => {
          await marsPosts[0].addLike(jupiter)
          const expectedContent = [...lunaPostsContent].reverse()
          await homeFeedEqualTo(luna, expectedContent, luna.id)
        })
      })

      describe('Jupiter comments Mars post', () => {
        it("not changes posts order in Luna's home feed", async () => {
          await addCommentToPost(jupiter, marsPosts[0], 'Tare')
          const expectedContent = [...lunaPostsContent].reverse()
          await homeFeedEqualTo(luna, expectedContent, luna.id)
        })
      })

      describe('second and other likes', () => {
        it("not changes posts order in Luna's home feed", async () => {
          let expectedContent
          await marsPosts[0].addLike(luna)
          expectedContent = ['Able'].concat([...lunaPostsContent].reverse())
          await homeFeedEqualTo(luna, expectedContent, luna.id)

          await addCommentToPost(luna, lunaPosts[0], 'Roger')
          expectedContent = ['A', 'Able', 'C', 'B']
          await homeFeedEqualTo(luna, expectedContent, luna.id)

          await marsPosts[0].addLike(jupiter)
          await homeFeedEqualTo(luna, expectedContent, luna.id)
        })
      })

      describe('likes of already commented post', () => {
        it("not changes posts order in Luna's home feed", async () => {
          let expectedContent

          await addCommentToPost(luna, marsPosts[0], 'Queen')
          expectedContent = ['Able', 'C', 'B', 'A']
          await homeFeedEqualTo(luna, expectedContent, luna.id)

          await addCommentToPost(jupiter, lunaPosts[1], 'Peter')
          expectedContent = ['B', 'Able', 'C', 'A']
          await homeFeedEqualTo(luna, expectedContent, luna.id)

          await marsPosts[0].addLike(jupiter)
          await homeFeedEqualTo(luna, expectedContent, luna.id)

          await marsPosts[0].addLike(luna)
          await homeFeedEqualTo(luna, expectedContent, luna.id)
        })
      })

      describe('and Mars banned Luna', () => {
        beforeEach(async () => {
          await mars.ban(luna.username)
        })

        describe('Luna likes Mars post', () => {
          beforeEach(async () => {
            await marsPosts[0].addLike(luna)
          })

          it('not changes posts order in Luna home feed', async () => {
            const expectedContent = ['C', 'B', 'A']
            await homeFeedEqualTo(luna, expectedContent, luna.id)
          })

          it("not changes posts order in Mars's home feed", async () => {
            const expectedContent = [...marsPostsContent].reverse()
            await homeFeedEqualTo(mars, expectedContent, mars.id)
          })
        })

        describe('Luna comments Mars post', () => {
          beforeEach(async () => {
            await addCommentToPost(luna, marsPosts[0], 'Victor')
          })

          it('not brings post to Luna home feed', async () => {
            const expectedContent = ['C', 'B', 'A']
            await homeFeedEqualTo(luna, expectedContent, luna.id)
          })

          it("brings post to the top of Mars's home feed", async () => {
            const expectedContent = ['Able', 'Dog', 'Charlie', 'Baker']
            await homeFeedEqualTo(mars, expectedContent, mars.id)
          })
        })

        describe('Mars likes Luna post', () => {
          beforeEach(async () => {
            await lunaPosts[0].addLike(mars)
          })

          it('not brings post to Mars home feed', async () => {
            const expectedContent = ['Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(mars, expectedContent, mars.id)
          })

          it('not changes posts order in Luna home feed', async () => {
            const expectedContent = ['C', 'B', 'A']
            await homeFeedEqualTo(luna, expectedContent, luna.id)
          })
        })

        describe('Mars comments Luna post', () => {
          beforeEach(async () => {
            await addCommentToPost(mars, lunaPosts[0], 'Victor')
          })

          it('not brings post to Mars home feed', async () => {
            const expectedContent = ['Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(mars, expectedContent, mars.id)
          })

          it('brings post to the top of Luna home feed', async () => {
            const expectedContent = ['A', 'C', 'B']
            await homeFeedEqualTo(luna, expectedContent, luna.id)
          })
        })
      })
    })

    describe('Luna and Mars are friends', () => {
      beforeEach(async () => {
        const [marsTimelineId, lunaTimelineId] = await Promise.all([mars.getPostsTimelineId(), luna.getPostsTimelineId()])
        await Promise.all([luna.subscribeTo(marsTimelineId), mars.subscribeTo(lunaTimelineId)]);
      })

      describe("post is already included into Luna's home feed", () => {
        it('likes not changes posts order', async () => {
          await marsPosts[0].addLike(luna)
          const expectedContent = [...marsPostsContent].reverse().concat([...lunaPostsContent].reverse())
          await homeFeedEqualTo(luna, expectedContent, luna.id)

          await marsPosts[0].addLike(jupiter)
          await homeFeedEqualTo(luna, expectedContent, luna.id)
        })

        it('each comment moves the post to the top', async () => {
          let expectedContent

          await addCommentToPost(luna, marsPosts[0], 'Zebra')
          expectedContent = ['Able', 'Dog', 'Charlie', 'Baker', 'C', 'B', 'A']
          await homeFeedEqualTo(luna, expectedContent, luna.id)

          await addCommentToPost(luna, marsPosts[2], 'Yoke')
          expectedContent = ['Charlie', 'Able', 'Dog', 'Baker', 'C', 'B', 'A']
          await homeFeedEqualTo(luna, expectedContent, luna.id)

          await addCommentToPost(luna, marsPosts[0], 'X-ray')
          expectedContent = ['Able', 'Charlie', 'Dog', 'Baker', 'C', 'B', 'A']
          await homeFeedEqualTo(luna, expectedContent, luna.id)

          await addCommentToPost(jupiter, marsPosts[2], 'William')
          expectedContent = ['Charlie', 'Able', 'Dog', 'Baker', 'C', 'B', 'A']
          await homeFeedEqualTo(luna, expectedContent, luna.id)

          await addCommentToPost(luna, lunaPosts[0], 'Whiskey')
          expectedContent = ['A', 'Charlie', 'Able', 'Dog', 'Baker', 'C', 'B']
          await homeFeedEqualTo(luna, expectedContent, luna.id)
        })

        describe('and Luna banned Mars', () => {
          beforeEach(async () => {
            await luna.ban(mars.username)
          })

          describe("Luna's posts", () => {
            it('disappears from Mars home feed', async () => {
              const expectedContent = [...marsPostsContent].reverse()
              await homeFeedEqualTo(mars, expectedContent, mars.id)
            })
          })

          describe("Mars's posts", () => {
            it('disappears from Luna home feed', async () => {
              const expectedContent = [...lunaPostsContent].reverse()
              await homeFeedEqualTo(luna, expectedContent, luna.id)
            })
          })

          describe('Luna likes Mars post', () => {
            beforeEach(async () => {
              await marsPosts[0].addLike(luna)
            })

            it('likes not changes posts order in Luna home feed', async () => {
              const expectedContent = [...lunaPostsContent].reverse()
              await homeFeedEqualTo(luna, expectedContent, luna.id)
            })

            it("not brings post to Mars's home feed", async () => {
              const expectedContent = [...marsPostsContent].reverse()
              await homeFeedEqualTo(mars, expectedContent, mars.id)
            })
          })

          describe('Luna comments Mars post', () => {
            beforeEach(async () => {
              await addCommentToPost(luna, marsPosts[0], 'Victor')
            })

            it("not brings post to Luna's home feed", async () => {
              const expectedContent = ['C', 'B', 'A']
              await homeFeedEqualTo(luna, expectedContent, luna.id)
            })

            it("brings post to the top of Mars's home feed", async () => {
              const expectedContent = ['Able', 'Dog', 'Charlie', 'Baker']
              await homeFeedEqualTo(mars, expectedContent, mars.id)
            })
          })

          describe('Mars likes Luna post', () => {
            beforeEach(async () => {
              await lunaPosts[0].addLike(mars)
            })

            it('not brings post to Mars home feed', async () => {
              const expectedContent = ['Dog', 'Charlie', 'Baker', 'Able']
              await homeFeedEqualTo(mars, expectedContent, mars.id)
            })

            it('not changes posts order in Luna home feed', async () => {
              const expectedContent = ['C', 'B', 'A']
              await homeFeedEqualTo(luna, expectedContent, luna.id)
            })
          })

          describe('Mars comments Luna post', () => {
            beforeEach(async () => {
              await addCommentToPost(mars, lunaPosts[0], 'Victor')
            })

            it('not brings post to Mars home feed', async () => {
              const expectedContent = ['Dog', 'Charlie', 'Baker', 'Able']
              await homeFeedEqualTo(mars, expectedContent, mars.id)
            })

            it('brings post to the top of Luna home feed', async () => {
              const expectedContent = ['A', 'C', 'B']
              await homeFeedEqualTo(luna, expectedContent, luna.id)
            })
          })
        })
      })
    })
  })

  describe('public users Luna, Mars, Pluto and stranger Jupiter', () => {
    const lunaPostsContent = ['A', 'B', 'C']
        , marsPostsContent = ['Able', 'Baker', 'Charlie', 'Dog']
        , plutoPostsContent = ['Alpha', 'Beta', 'Gamma', 'Delta']
    let luna
      , mars
      , pluto
      , jupiter
      , lunaPosts
      , marsPosts
      , plutoPosts

    beforeEach(async () => {
      luna = new User({ username: 'Luna', password: 'password' })
      mars = new User({ username: 'Mars', password: 'password' })
      pluto = new User({ username: 'Pluto', password: 'password' })
      jupiter = new User({ username: 'Jupiter', password: 'password' })

      await Promise.all([luna.create(), mars.create(), pluto.create(), jupiter.create()]);

      lunaPosts = []
      for (const body of lunaPostsContent) {
        const post = await luna.newPost({ body })  // eslint-disable-line babel/no-await-in-loop
        lunaPosts.push(await post.create())  // eslint-disable-line babel/no-await-in-loop
      }

      marsPosts = []
      for (const body of marsPostsContent) {
        const post = await mars.newPost({ body })  // eslint-disable-line babel/no-await-in-loop
        marsPosts.push(await post.create())  // eslint-disable-line babel/no-await-in-loop
      }

      plutoPosts = []
      for (const body of plutoPostsContent) {
        const post = await pluto.newPost({ body })  // eslint-disable-line babel/no-await-in-loop
        plutoPosts.push(await post.create())  // eslint-disable-line babel/no-await-in-loop
      }
    })

    describe('isFriends(Luna, Mars) && isFriends(Mars, Pluto)', () => {
      beforeEach(async () => {
        const [marsTimelineId, lunaTimelineId, plutoTimelineId] = await Promise.all([
          mars.getPostsTimelineId(), luna.getPostsTimelineId(), pluto.getPostsTimelineId()
        ]);

        await Promise.all([
          luna.subscribeTo(marsTimelineId),
          mars.subscribeTo(lunaTimelineId),
          mars.subscribeTo(plutoTimelineId),
          pluto.subscribeTo(marsTimelineId)
        ]);
      })

      it("Pluto home feed consists of Pluto's and Mars's posts", async () => {
        const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
        await homeFeedEqualTo(pluto, expectedContent, pluto.id)
      })

      it("friend's likes brings friend of friend's posts to Pluto home feed", async () => {
        await lunaPosts[0].addLike(mars)
        const expectedContent = ['A', 'Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
        await homeFeedEqualTo(pluto, expectedContent, pluto.id)
      })

      it("only first like bumps Luna's liked post in Pluto home feed", async () => {
        await lunaPosts[0].addLike(mars)
        await addCommentToPost(mars, marsPosts[0], 'Whiskey')
        await lunaPosts[0].addLike(pluto)
        const expectedContent = ['Able', 'A', 'Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker']
        await homeFeedEqualTo(pluto, expectedContent, pluto.id)
      })

      it("friend's comments brings friend of friend's posts to Pluto home feed", async () => {
        await addCommentToPost(mars, lunaPosts[0], 'Whiskey')
        const expectedContent = ['A', 'Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
        await homeFeedEqualTo(pluto, expectedContent, pluto.id)
      })

      it("friend's comments bumps posts in Pluto home feed", async () => {
        await addCommentToPost(mars, lunaPosts[0], 'Whiskey')
        await addCommentToPost(luna, marsPosts[0], 'Oboe')
        const expectedContent = ['Able', 'A', 'Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker']
        await homeFeedEqualTo(pluto, expectedContent, pluto.id)
      })

      it("stranger's likes does not bring friend of friend's posts to Pluto home feed", async () => {
        await lunaPosts[0].addLike(jupiter)
        const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
        await homeFeedEqualTo(pluto, expectedContent, pluto.id)
      })

      it("stranger's comments does not bring friend of friend's posts to Pluto home feed", async () => {
        await addCommentToPost(jupiter, lunaPosts[0], 'Nan')
        const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
        await homeFeedEqualTo(pluto, expectedContent, pluto.id)
      })

      describe('second-level friends communication', () => {
        beforeEach(async () => {
          const jupiterPostsContent = ['Affirm', 'Clear', 'Negative']
          const marsTimelineId  = await mars.getPostsTimelineId()
          const jupiterTimelineId  = await jupiter.getPostsTimelineId()
          await mars.subscribeTo(jupiterTimelineId)
          await jupiter.subscribeTo(marsTimelineId)
          const jupiterPosts = []
          for (const body of jupiterPostsContent) {
            const post = await jupiter.newPost({ body })  // eslint-disable-line babel/no-await-in-loop
            jupiterPosts.push(await post.create())  // eslint-disable-line babel/no-await-in-loop
          }
        })

        it("likes does not bring friend of friend's posts to Pluto home feed", async () => {
          await lunaPosts[0].addLike(jupiter)
          const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
          await homeFeedEqualTo(pluto, expectedContent, pluto.id)
        })

        it("stranger's comments does not bring friend of friend's posts to Pluto home feed", async () => {
          await addCommentToPost(jupiter, lunaPosts[0], 'Nan')
          const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
          await homeFeedEqualTo(pluto, expectedContent, pluto.id)
        })
      })


      describe('Luna banned Pluto', () => {
        describe('before any activity', () => {
          beforeEach(async () => {
            await luna.ban(pluto.username)
          })

          it("friend's likes not brings banner's posts to Pluto home feed", async () => {
            await lunaPosts[0].addLike(mars)
            const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })

          it("friend's comments not brings banner's posts to Pluto home feed", async () => {
            await addCommentToPost(mars, lunaPosts[0], 'Whiskey')
            const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })
        })

        describe('after comment', () => {
          beforeEach(async () => {
            await addCommentToPost(mars, lunaPosts[0], 'Whiskey')
            await luna.ban(pluto.username)
          })

          it("posts bringed to Pluto home feed by friend's comment disappears", async () => {
            const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })

          it("and then friend's comments not brings banner's posts to Pluto home feed", async () => {
            await addCommentToPost(mars, lunaPosts[0], 'Mike')
            const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })

          it("and then friend's likes not brings banner's posts to Pluto home feed", async () => {
            await lunaPosts[0].addLike(mars)
            const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })
        })

        describe('after like', () => {
          beforeEach(async () => {
            await lunaPosts[0].addLike(mars)
            await luna.ban(pluto.username)
          })

          it("posts bringed to Pluto home feed by friend's likes disappears", async () => {
            const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })

          it("and then friend's comments not brings banner's posts to Pluto home feed", async () => {
            await addCommentToPost(mars, lunaPosts[0], 'Mike')
            const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })

          it("and then friend's likes not brings banner's posts to Pluto home feed", async () => {
            await lunaPosts[1].addLike(mars)
            const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })
        })
      })

      describe('Luna banned Mars', () => {
        describe('before any activity', () => {
          beforeEach(async () => {
            await luna.ban(mars.username)
          })

          it("friend's likes brings banner's posts to Pluto home feed", async () => {
            await lunaPosts[0].addLike(mars)
            const expectedContent = ['A', 'Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })

          it("friend's comments brings banner's posts to Pluto home feed", async () => {
            await addCommentToPost(mars, lunaPosts[0], 'Whiskey')
            const expectedContent = ['A', 'Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })
        })

        describe('after comment', () => {
          beforeEach(async () => {
            await addCommentToPost(mars, lunaPosts[0], 'Whiskey')
            await luna.ban(mars.username)
          })

          it("posts bringed into Pluto home feed by friend's comment doesn't disappear", async () => {
            const expectedContent = ['A', 'Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })

          it("and then friend's comments brings banner's posts to Pluto home feed", async () => {
            await addCommentToPost(mars, lunaPosts[1], 'Mike')
            const expectedContent = ['B', 'A', 'Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })

          it("and then friend's likes brings banner's posts to Pluto home feed", async () => {
            await lunaPosts[1].addLike(mars)
            const expectedContent = ['B', 'A', 'Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })
        })

        describe('after like', () => {
          beforeEach(async () => {
            await lunaPosts[0].addLike(mars)
            await luna.ban(mars.username)
          })

          it("posts bringed into Pluto home feed by friend's likes doesn't disappear", async () => {
            const expectedContent = ['A', 'Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })

          it("and then friend's comments brings banner's posts to Pluto home feed", async () => {
            await addCommentToPost(mars, lunaPosts[1], 'Mike')
            const expectedContent = ['B', 'A', 'Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })

          it("and then friend's likes brings banner's posts to Pluto home feed", async () => {
            await lunaPosts[1].addLike(mars)
            const expectedContent = ['B', 'A', 'Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })
        })
      })

      describe('Pluto banned Luna', () => {
        describe('before any activity', () => {
          beforeEach(async () => {
            await pluto.ban(luna.username)
          })

          it("friend's likes not brings banned user's posts to Pluto home feed", async () => {
            await lunaPosts[0].addLike(mars)
            const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })

          it("friend's comments not brings banned user's posts to Pluto home feed", async () => {
            await addCommentToPost(mars, lunaPosts[0], 'Whiskey')
            const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })
        })

        describe('after comment', () => {
          beforeEach(async () => {
            await addCommentToPost(mars, lunaPosts[0], 'Whiskey')
            await pluto.ban(luna.username)
          })

          it("posts bringed to Pluto home feed by friend's comment disappears", async () => {
            const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })

          it("and then friend's comments not brings banned user's posts to Pluto home feed", async () => {
            await addCommentToPost(mars, lunaPosts[1], 'Mike')
            const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })

          it("and then friend's likes not brings banned user's posts to Pluto home feed", async () => {
            await lunaPosts[1].addLike(mars)
            const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })
        })

        describe('after like', () => {
          beforeEach(async () => {
            await lunaPosts[0].addLike(mars)
            await pluto.ban(luna.username)
          })

          it("posts bringed to Pluto home feed by friend's likes disappears", async () => {
            const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })

          it("and then friend's comments not brings banned user's posts to Pluto home feed", async () => {
            await addCommentToPost(mars, lunaPosts[1], 'Mike')
            const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })

          it("and then friend's likes not brings banned user's posts to Pluto home feed", async () => {
            await lunaPosts[1].addLike(mars)
            const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })
        })
      })

      describe('Pluto banned Mars', () => {
        describe('before any activity', () => {
          beforeEach(async () => {
            await pluto.ban(mars.username)
          })

          it("banned user's likes brings posts to Pluto home feed", async () => {
            await lunaPosts[0].addLike(mars)
            const expectedContent = ['A', 'Delta', 'Gamma', 'Beta', 'Alpha']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })

          it("banned user's comments brings posts to Pluto home feed", async () => {
            await addCommentToPost(mars, lunaPosts[0], 'Whiskey')
            const expectedContent = ['A', 'Delta', 'Gamma', 'Beta', 'Alpha']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })
        })

        describe('after comment', () => {
          beforeEach(async () => {
            await addCommentToPost(mars, lunaPosts[0], 'Whiskey')
            await pluto.ban(mars.username)
          })

          it("posts bringed to Pluto home feed by banned user's comment doesn't disappear", async () => {
            const expectedContent = ['A', 'Delta', 'Gamma', 'Beta', 'Alpha']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })

          it("and then banned user's comments brings posts to Pluto home feed", async () => {
            await addCommentToPost(mars, lunaPosts[1], 'Mike')
            const expectedContent = ['B', 'A', 'Delta', 'Gamma', 'Beta', 'Alpha']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })

          it("and then banned user's likes brings posts to Pluto home feed", async () => {
            await lunaPosts[1].addLike(mars)
            const expectedContent = ['B', 'A', 'Delta', 'Gamma', 'Beta', 'Alpha']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })
        })

        describe('after like', () => {
          beforeEach(async () => {
            await lunaPosts[0].addLike(mars)
            await pluto.ban(mars.username)
          })

          it("posts bringed to Pluto home feed by banned user's likes doesn't disappear", async () => {
            const expectedContent = ['A', 'Delta', 'Gamma', 'Beta', 'Alpha']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })

          it("and then banned user's comments brings posts to Pluto home feed", async () => {
            await addCommentToPost(mars, lunaPosts[1], 'Mike')
            const expectedContent = ['B', 'A', 'Delta', 'Gamma', 'Beta', 'Alpha']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })

          it("and then banned user's likes brings posts to Pluto home feed", async () => {
            await lunaPosts[1].addLike(mars)
            const expectedContent = ['B', 'A', 'Delta', 'Gamma', 'Beta', 'Alpha']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })
        })
      })
    })
  })

  describe('public users Mars, Pluto and private user Luna', () => {
    const lunaPostsContent = ['A', 'B', 'C']
      , marsPostsContent   = ['Able', 'Baker', 'Charlie', 'Dog']
      , plutoPostsContent  = ['Alpha', 'Beta', 'Gamma', 'Delta']
    let luna
      , mars
      , pluto
      , lunaPosts
      , marsPosts
      , plutoPosts

    beforeEach(async () => {
      luna       = new User({ username: 'Luna', password: 'password' })
      mars       = new User({ username: 'Mars', password: 'password' })
      pluto      = new User({ username: 'Pluto', password: 'password' })

      await Promise.all([luna.create(), mars.create(), pluto.create()]);
      await luna.update({ isPrivate: '1' })

      lunaPosts  = []
      for (const body of lunaPostsContent) {
        const post = await luna.newPost({ body })  // eslint-disable-line babel/no-await-in-loop
        lunaPosts.push(await post.create())  // eslint-disable-line babel/no-await-in-loop
      }

      marsPosts  = []
      for (const body of marsPostsContent) {
        const post = await mars.newPost({ body })  // eslint-disable-line babel/no-await-in-loop
        marsPosts.push(await post.create())  // eslint-disable-line babel/no-await-in-loop
      }

      plutoPosts = []
      for (const body of plutoPostsContent) {
        const post = await pluto.newPost({ body })  // eslint-disable-line babel/no-await-in-loop
        plutoPosts.push(await post.create())  // eslint-disable-line babel/no-await-in-loop
      }
    })

    describe('isFriends(Luna, Mars) && isFriends(Mars, Pluto)', () => {
      beforeEach(async () => {
        const [marsTimelineId, lunaTimelineId, plutoTimelineId] = await Promise.all([
          mars.getPostsTimelineId(), luna.getPostsTimelineId(), await pluto.getPostsTimelineId()
        ]);

        await Promise.all([
          luna.subscribeTo(marsTimelineId),
          mars.subscribeTo(lunaTimelineId),
          mars.subscribeTo(plutoTimelineId),
          pluto.subscribeTo(marsTimelineId)
        ]);
      })

      describe("private user's posts are not bringed to Pluto home feed", () => {
        it('by friend likes', async () => {
          await lunaPosts[0].addLike(mars)
          const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
          await homeFeedEqualTo(pluto, expectedContent, pluto.id)
        })

        it('by friend comments', async () => {
          await addCommentToPost(mars, lunaPosts[0], 'Whiskey')
          const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
          await homeFeedEqualTo(pluto, expectedContent, pluto.id)
        })
      })
    })
  })

  describe('public users Luna, Mars, Pluto and private group EasyFox (owned by Luna)', () => {
    const lunaPostsContent = ['A', 'B', 'C']
      , marsPostsContent   = ['Able', 'Baker', 'Charlie', 'Dog']
      , plutoPostsContent  = ['Alpha', 'Beta', 'Gamma', 'Delta']
      , easyfoxPostsContent  = ['How', 'Item', 'Jig']
    let luna
      , mars
      , pluto
      , easyfox
      , lunaPosts
      , marsPosts
      , plutoPosts
      , easyfoxPosts
      , easyfoxTimelineId

    beforeEach(async () => {
      luna       = new User({ username: 'Luna', password: 'password' })
      mars       = new User({ username: 'Mars', password: 'password' })
      pluto      = new User({ username: 'Pluto', password: 'password' })
      easyfox    = new Group({ username: 'EasyFox', password: 'password', isPrivate: '1' })

      await Promise.all([luna.create(), mars.create(), pluto.create()]);
      await easyfox.create(luna.id)

      easyfoxTimelineId = await easyfox.getPostsTimelineId()

      lunaPosts  = []
      for (const body of lunaPostsContent) {
        const post = await luna.newPost({ body })  // eslint-disable-line babel/no-await-in-loop
        lunaPosts.push(await post.create())  // eslint-disable-line babel/no-await-in-loop
      }

      marsPosts  = []
      for (const body of marsPostsContent) {
        const post = await mars.newPost({ body })  // eslint-disable-line babel/no-await-in-loop
        marsPosts.push(await post.create())  // eslint-disable-line babel/no-await-in-loop
      }

      plutoPosts = []
      for (const body of plutoPostsContent) {
        const post = await pluto.newPost({ body })  // eslint-disable-line babel/no-await-in-loop
        plutoPosts.push(await post.create())  // eslint-disable-line babel/no-await-in-loop
      }

      easyfoxPosts = []
      for (const body of easyfoxPostsContent) {
        const post = await easyfox.newPost({ body, timelineIds: [easyfoxTimelineId] })  // eslint-disable-line babel/no-await-in-loop
        easyfoxPosts.push(await post.create())  // eslint-disable-line babel/no-await-in-loop
      }
    })

    describe('isFriends(Luna, Mars) && isFriends(Mars, Pluto) && easyFox.isGroupMember(Mars)', () => {
      beforeEach(async () => {
        const [marsTimelineId, lunaTimelineId, plutoTimelineId] = await Promise.all([
          mars.getPostsTimelineId(), luna.getPostsTimelineId(), await pluto.getPostsTimelineId()
        ]);

        await Promise.all([
          luna.subscribeTo(marsTimelineId),
          mars.subscribeTo(lunaTimelineId),
          mars.subscribeTo(plutoTimelineId),
          pluto.subscribeTo(marsTimelineId)
        ]);
      })

      describe('EasyFox posts feed consists of', () => {
        it('group posts', async () => {
          const expectedContent = ['Jig', 'Item', 'How']

          const postsFeed = await easyfox.getPostsTimeline({ currentUser: luna.id })
          const posts = await postsFeed.getPosts()

          posts.should.not.be.empty
          posts.length.should.eql(expectedContent.length)
          const postsFeedContent = posts.map((p) => {
            return p.body
          }).join(',')
          postsFeedContent.should.eql(expectedContent.join(','))
        })
      })

      describe('Mars is member of EasyFox', () => {
        beforeEach(async () => {
          await mars.subscribeTo(easyfoxTimelineId)
        })

        describe('private group posts are not bringed to Pluto home feed', () => {
          it('by friend likes', async () => {
            await easyfoxPosts[0].addLike(mars)
            const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })

          it('by friend comments', async () => {
            await addCommentToPost(mars, easyfoxPosts[0], 'Whiskey')
            const expectedContent = ['Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able']
            await homeFeedEqualTo(pluto, expectedContent, pluto.id)
          })
        })

        describe("private group posts are not bringed to the top of subscriber's home feed", () => {
          it('by friend likes', async () => {
            await easyfoxPosts[0].addLike(luna)
            const expectedContent = ['Jig', 'Item', 'How', 'Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able', 'C', 'B', 'A']
            await homeFeedEqualTo(mars, expectedContent, mars.id)
          })
        })

        describe("private group posts are bringed to the top of subscriber's home feed", () => {
          it('by friend comments', async () => {
            await addCommentToPost(luna, easyfoxPosts[0], 'Whiskey')
            const expectedContent = ['How', 'Jig', 'Item', 'Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able', 'C', 'B', 'A']
            await homeFeedEqualTo(mars, expectedContent, mars.id)
          })
        })

        describe("new private group posts are bringed to subscriber's home feed", () => {
          it('after post creation', async () => {
            const post = await easyfox.newPost({ body: 'King NaN', timelineIds: [easyfoxTimelineId] })
            easyfoxPosts.push(await post.create())

            const expectedContent = ['King NaN', 'Jig', 'Item', 'How', 'Delta', 'Gamma', 'Beta', 'Alpha', 'Dog', 'Charlie', 'Baker', 'Able', 'C', 'B', 'A']
            await homeFeedEqualTo(mars, expectedContent, mars.id)
          })
        })
      })
    })
  })

  describe('feed pagination and local bumps', () => {
    const lunaPostsContent = ['A', 'B', 'C']
      , marsPostsContent = ['Able', 'Baker', 'Charlie', 'Dog']
      , plutoPostsContent = ['Alpha', 'Beta', 'Gamma', 'Delta']
    let luna
      , mars
      , pluto
      , lunaPosts
      , marsPosts
      , plutoPosts

    beforeEach(async () => {
      luna = new User({ username: 'Luna', password: 'password' })
      mars = new User({ username: 'Mars', password: 'password' })
      pluto = new User({ username: 'Pluto', password: 'password' })

      await Promise.all([luna.create(), mars.create(), pluto.create()]);

      lunaPosts = []
      for (const body of lunaPostsContent) {
        const post = await luna.newPost({ body })  // eslint-disable-line babel/no-await-in-loop
        lunaPosts.push(await post.create())  // eslint-disable-line babel/no-await-in-loop
      }

      marsPosts = []
      for (const body of marsPostsContent) {
        const post = await mars.newPost({ body })  // eslint-disable-line babel/no-await-in-loop
        marsPosts.push(await post.create())  // eslint-disable-line babel/no-await-in-loop
      }

      plutoPosts = []
      for (const body of plutoPostsContent) {
        const post = await pluto.newPost({ body })  // eslint-disable-line babel/no-await-in-loop
        plutoPosts.push(await post.create())  // eslint-disable-line babel/no-await-in-loop
      }

      const [marsTimelineId, lunaTimelineId, plutoTimelineId] = await Promise.all([
        mars.getPostsTimelineId(), luna.getPostsTimelineId(), await pluto.getPostsTimelineId()
      ]);

      await Promise.all([
        luna.subscribeTo(marsTimelineId),
        mars.subscribeTo(lunaTimelineId),
        mars.subscribeTo(plutoTimelineId),
        pluto.subscribeTo(marsTimelineId)
      ]);
    })

    it('home feed pages should consists of requested number of posts', async () => {
      let expectedContent = ['Delta', 'Gamma', 'Beta']
      await homeFeedPageEqualTo(pluto, expectedContent, pluto.id, 3, 0)

      expectedContent = ['Alpha', 'Dog', 'Charlie']
      await homeFeedPageEqualTo(pluto, expectedContent, pluto.id, 3, 3)

      expectedContent = ['Baker', 'Able']
      await homeFeedPageEqualTo(pluto, expectedContent, pluto.id, 3, 6)
    })

    it('like should bring post to the top of home feed first page', async () => {
      await lunaPosts[0].addLike(mars)

      const expectedContent = ['A', 'Delta', 'Gamma']
      await homeFeedPageEqualTo(pluto, expectedContent, pluto.id, 3, 0)
    })

    it('like should not bring post to home feed second page', async () => {
      await lunaPosts[0].addLike(mars)

      const expectedContent = ['Beta', 'Alpha', 'Dog']
      await homeFeedPageEqualTo(pluto, expectedContent, pluto.id, 3, 3)
    })

    it('like should not bring post to home feed other pages', async () => {
      await lunaPosts[0].addLike(mars)

      const expectedContent = ['Charlie', 'Baker', 'Able']
      await homeFeedPageEqualTo(pluto, expectedContent, pluto.id, 3, 6)
    })
  })
})
