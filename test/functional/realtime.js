/* eslint-env node, mocha */
/* global $database, $pg_database */
import origExpect from 'unexpected';

import cleanDB from '../dbCleaner';
import { getSingleton } from '../../app/app';
import { dbAdapter, PubSub } from '../../app/models';
import { PubSubAdapter } from '../../app/support/PubSubAdapter';

import * as funcTestHelper from './functional_test_helper';
import * as realtimeAssertions from './realtime_assertions';

const expect = origExpect.clone().use(realtimeAssertions);

describe('Realtime (Socket.io)', () => {
  before(async () => {
    await getSingleton();
    const pubsubAdapter = new PubSubAdapter($database);
    PubSub.setPublisher(pubsubAdapter);
  });

  let lunaContext = {};
  let marsContext = {};
  let marsTimeline = null,
    marsRiverOfNews,
    marsCommentsFeed;
  let lunaTimeline = null,
    lunaRiverOfNews,
    lunaCommentsFeed;
  const anonContext = { authToken: '' };

  beforeEach(async () => {
    await cleanDB($pg_database);

    [lunaContext, marsContext] = await Promise.all([
      funcTestHelper.createUserAsync('luna', 'pw'),
      funcTestHelper.createUserAsync('mars', 'pw'),
    ]);

    [
      { Posts: lunaTimeline, RiverOfNews: lunaRiverOfNews, Comments: lunaCommentsFeed },
      { Posts: marsTimeline, RiverOfNews: marsRiverOfNews, Comments: marsCommentsFeed },
    ] = await Promise.all([
      dbAdapter.getUserTimelinesIds(lunaContext.user.id),
      dbAdapter.getUserTimelinesIds(marsContext.user.id),
    ]);
  });

  describe('User timeline', () => {
    it('Luna gets notifications about public posts', () =>
      expect(
        lunaContext,
        'when subscribed to timeline',
        marsTimeline,
        'to get post:* events from',
        marsContext,
      ));

    it('Anonymous user gets notifications about public posts', () =>
      expect(
        anonContext,
        'when subscribed to timeline',
        marsTimeline,
        'to get post:* events from',
        marsContext,
      ));

    describe('Mars is a private user', () => {
      beforeEach(async () => {
        await funcTestHelper.goPrivate(marsContext);
      });

      it('Luna does not get notifications about his posts', () =>
        expect(
          lunaContext,
          'when subscribed to timeline',
          marsTimeline,
          'not to get post:* events from',
          marsContext,
        ));

      describe("Mars accepted luna's subscription request", () => {
        beforeEach(async () => {
          await funcTestHelper.sendRequestToSubscribe(lunaContext, marsContext);
          await funcTestHelper.acceptRequestAsync(marsContext, lunaContext);
        });

        it('Luna gets notifications about his posts', () =>
          expect(
            lunaContext,
            'when subscribed to timeline',
            marsTimeline,
            'to get post:* events from',
            marsContext,
          ));
      });
    });

    describe('Mars blocked luna', () => {
      beforeEach(async () => {
        await funcTestHelper.banUser(marsContext, lunaContext);
      });

      it('Luna does not get notifications about his posts', () =>
        expect(
          lunaContext,
          'when subscribed to timeline',
          marsTimeline,
          'not to get post:* events from',
          marsContext,
        ));

      it('Mars does not get notifications about her posts', () =>
        expect(
          marsContext,
          'when subscribed to timeline',
          lunaTimeline,
          'not to get post:* events from',
          lunaContext,
        ));

      describe('Reactions', () => {
        let venusContext = {};
        let venusTimeline = null;
        let postId;

        beforeEach(async () => {
          venusContext = await funcTestHelper.createUserAsync('venus', 'pw');
          [{ id: postId }, { Posts: venusTimeline }] = await Promise.all([
            funcTestHelper.createAndReturnPost(venusContext, 'test post'),
            dbAdapter.getUserTimelinesIds(venusContext.user.id),
          ]);
        });

        it('Mars does not get notifications about her likes', () =>
          expect(
            marsContext,
            'when subscribed to timeline',
            venusTimeline,
            'with post having id',
            postId,
            'not to get like:* events from',
            lunaContext,
          ));

        it('Mars does not get notifications about her comments', () =>
          expect(
            marsContext,
            'when subscribed to timeline',
            venusTimeline,
            'with post having id',
            postId,
            'not to get comment:* events from',
            lunaContext,
          ));
      });
    });
  });

  describe('Comment likes', () => {
    let jupiter;
    let lunaPost;
    let lunaComment, marsComment, jupiterComment;

    const commentHavingNLikesExpectation = (nLikes, hasOwn, likerId) => ({
      comments: {
        likes: nLikes,
        hasOwnLike: hasOwn,
        userId: likerId,
      },
    });

    beforeEach(async () => {
      jupiter = await funcTestHelper.createUserAsync('jupiter', 'pw');
      lunaPost = await funcTestHelper.createAndReturnPost(lunaContext, 'Luna post');

      await funcTestHelper.mutualSubscriptions([lunaContext, marsContext]);
    });

    describe('comment_like:new message', () => {
      beforeEach(async () => {
        const [lunaCommentRes, marsCommentRes, jupiterCommentRes] = await Promise.all([
          funcTestHelper.createCommentAsync(lunaContext, lunaPost.id, 'Luna comment'),
          funcTestHelper.createCommentAsync(marsContext, lunaPost.id, 'Mars comment'),
          funcTestHelper.createCommentAsync(jupiter, lunaPost.id, 'Jupiter comment'),
        ]);
        [
          { comments: lunaComment },
          { comments: marsComment },
          { comments: jupiterComment },
        ] = await Promise.all([
          lunaCommentRes.json(),
          marsCommentRes.json(),
          jupiterCommentRes.json(),
        ]);
      });
      describe('for public post', () => {
        describe('via post channel', () => {
          it('Anonymous user gets notifications about comment likes', async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              anonContext,
              'when subscribed to post',
              lunaPost.id,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:new event from',
              marsContext,
            );
            expect(
              msg,
              'to satisfy',
              commentHavingNLikesExpectation(1, false, marsContext.user.id),
            );
          });

          it('Luna gets notifications about comment likes to own comment', async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              lunaContext,
              'when subscribed to post',
              lunaPost.id,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:new event from',
              marsContext,
            );
            expect(
              msg,
              'to satisfy',
              commentHavingNLikesExpectation(1, false, marsContext.user.id),
            );
          });

          it("Luna gets notifications about comment likes to Mars' comment", async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              lunaContext,
              'when subscribed to post',
              lunaPost.id,
              'with comment having id',
              marsComment.id,
              'to get comment_like:new event from',
              jupiter,
            );
            expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, false, jupiter.user.id));
          });

          it("Luna gets notifications about comment likes to Mars' comment", async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              lunaContext,
              'when subscribed to post',
              lunaPost.id,
              'with comment having id',
              marsComment.id,
              'to get comment_like:new event from',
              lunaContext,
            );
            expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, true, lunaContext.user.id));
          });

          it("Mars gets notifications about comment likes to Luna's comment", async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              marsContext,
              'when subscribed to post',
              lunaPost.id,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:new event from',
              marsContext,
            );
            expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, true, marsContext.user.id));
          });

          describe('when post is hidden', () => {
            beforeEach(async () => {
              await funcTestHelper.hidePost(lunaPost.id, marsContext);
            });

            it("Mars gets notifications about comment likes to Luna's comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                marsContext,
                'when subscribed to post',
                lunaPost.id,
                'with comment having id',
                lunaComment.id,
                'to get comment_like:new event from',
                marsContext,
              );
              expect(
                msg,
                'to satisfy',
                commentHavingNLikesExpectation(1, true, marsContext.user.id),
              );
            });
          });

          describe('when Jupiter is banned by Luna', () => {
            beforeEach(async () => {
              await funcTestHelper.banUser(lunaContext, jupiter);
            });

            it("Luna doesn't get notifications about comment likes to Jupiter comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                lunaContext,
                'when subscribed to post',
                lunaPost.id,
                'with comment having id',
                jupiterComment.id,
                'not to get comment_like:new event from',
                marsContext,
              );
              expect(msg, 'to be', null);
            });

            it("Mars gets notifications about comment likes to Jupiter's comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                marsContext,
                'when subscribed to post',
                lunaPost.id,
                'with comment having id',
                jupiterComment.id,
                'to get comment_like:new event from',
                marsContext,
              );
              expect(
                msg,
                'to satisfy',
                commentHavingNLikesExpectation(1, true, marsContext.user.id),
              );
            });

            it("Luna doesn't get notifications about Jupiter's comment likes to own comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                lunaContext,
                'when subscribed to post',
                lunaPost.id,
                'with comment having id',
                lunaComment.id,
                'not to get comment_like:new event from',
                jupiter,
              );
              expect(msg, 'to be', null);
            });

            it("Jupiter doesn't get notifications about own comment likes to Luna's comment to Luna's post", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                jupiter,
                'when subscribed to post',
                lunaPost.id,
                'with comment having id',
                lunaComment.id,
                'not to get comment_like:new event from',
                jupiter,
              );
              expect(msg, 'to be', null);
            });
          });

          describe('when Jupiter is banned by Mars', () => {
            beforeEach(async () => {
              await funcTestHelper.banUser(marsContext, jupiter);
            });

            it("Mars doesn't get notifications about Jupiter's comment likes to Luna comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                marsContext,
                'when subscribed to post',
                lunaPost.id,
                'with comment having id',
                lunaComment.id,
                'not to get comment_like:new event from',
                jupiter,
              );
              expect(msg, 'to be', null);
            });

            it("Mars doesn't get notifications about comment likes to Jupiter's comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                marsContext,
                'when subscribed to post',
                lunaPost.id,
                'with comment having id',
                jupiterComment.id,
                'not to get comment_like:new event from',
                lunaContext,
              );
              expect(msg, 'to be', null);
            });

            it('Jupiter gets notifications about comment likes to own comment', async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                jupiter,
                'when subscribed to post',
                lunaPost.id,
                'with comment having id',
                jupiterComment.id,
                'to get comment_like:new event from',
                lunaContext,
              );
              expect(
                msg,
                'to satisfy',
                commentHavingNLikesExpectation(1, false, lunaContext.user.id),
              );
            });

            it("Jupiter gets notifications about comment likes to Mars' comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                jupiter,
                'when subscribed to post',
                lunaPost.id,
                'with comment having id',
                marsComment.id,
                'to get comment_like:new event from',
                lunaContext,
              );
              expect(
                msg,
                'to satisfy',
                commentHavingNLikesExpectation(1, false, lunaContext.user.id),
              );
            });
          });
        });

        describe('via Posts timeline channel', () => {
          it('Anonymous user gets notifications about comment likes', async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              anonContext,
              'when subscribed to timeline',
              lunaTimeline,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:new event from',
              marsContext,
            );
            expect(
              msg,
              'to satisfy',
              commentHavingNLikesExpectation(1, false, marsContext.user.id),
            );
          });

          it('Luna gets notifications about comment likes to own comment', async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              lunaContext,
              'when subscribed to timeline',
              lunaTimeline,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:new event from',
              marsContext,
            );
            expect(
              msg,
              'to satisfy',
              commentHavingNLikesExpectation(1, false, marsContext.user.id),
            );
          });

          it("Mars gets notifications about comment likes to Luna's comment", async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              marsContext,
              'when subscribed to timeline',
              lunaTimeline,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:new event from',
              marsContext,
            );
            expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, true, marsContext.user.id));
          });

          it("Luna gets notifications about comment likes to Mars' comment", async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              lunaContext,
              'when subscribed to timeline',
              lunaTimeline,
              'with comment having id',
              marsComment.id,
              'to get comment_like:new event from',
              jupiter,
            );
            expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, false, jupiter.user.id));
          });

          it("Luna gets notifications about comment likes to Mars' comment", async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              lunaContext,
              'when subscribed to timeline',
              lunaTimeline,
              'with comment having id',
              marsComment.id,
              'to get comment_like:new event from',
              lunaContext,
            );
            expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, true, lunaContext.user.id));
          });

          describe('when post is hidden by Mars', () => {
            beforeEach(async () => {
              await funcTestHelper.hidePost(lunaPost.id, marsContext);
            });

            it("Mars gets notifications about own comment likes to Luna's comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                marsContext,
                'when subscribed to timeline',
                lunaTimeline,
                'with comment having id',
                lunaComment.id,
                'to get comment_like:new event from',
                marsContext,
              );
              expect(
                msg,
                'to satisfy',
                commentHavingNLikesExpectation(1, true, marsContext.user.id),
              );
            });

            it("Mars gets notifications about Jupiter's comment likes to Luna's comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                marsContext,
                'when subscribed to timeline',
                lunaTimeline,
                'with comment having id',
                lunaComment.id,
                'to get comment_like:new event from',
                jupiter,
              );
              expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, false, jupiter.user.id));
            });
          });

          describe('when Jupiter is banned by Luna', () => {
            beforeEach(async () => {
              await funcTestHelper.banUser(lunaContext, jupiter);
            });

            it("Luna doesn't get notifications about comment likes to Jupiter comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                lunaContext,
                'when subscribed to timeline',
                lunaTimeline,
                'with comment having id',
                jupiterComment.id,
                'not to get comment_like:new event from',
                marsContext,
              );
              expect(msg, 'to be', null);
            });

            it("Mars gets notifications about comment likes to Jupiter's comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                marsContext,
                'when subscribed to timeline',
                lunaTimeline,
                'with comment having id',
                jupiterComment.id,
                'to get comment_like:new event from',
                marsContext,
              );
              expect(
                msg,
                'to satisfy',
                commentHavingNLikesExpectation(1, true, marsContext.user.id),
              );
            });

            it("Luna doesn't get notifications about Jupiter's comment likes to own comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                lunaContext,
                'when subscribed to timeline',
                lunaTimeline,
                'with comment having id',
                lunaComment.id,
                'not to get comment_like:new event from',
                jupiter,
              );
              expect(msg, 'to be', null);
            });

            it("Jupiter doesn't get notifications about own comment likes to Luna's comment to Luna's post", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                jupiter,
                'when subscribed to timeline',
                lunaTimeline,
                'with comment having id',
                lunaComment.id,
                'not to get comment_like:new event from',
                jupiter,
              );
              expect(msg, 'to be', null);
            });
          });

          describe('when Jupiter is banned by Mars', () => {
            beforeEach(async () => {
              await funcTestHelper.banUser(marsContext, jupiter);
            });

            it("Mars doesn't get notifications about Jupiter's comment likes to Luna comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                marsContext,
                'when subscribed to timeline',
                lunaTimeline,
                'with comment having id',
                lunaComment.id,
                'not to get comment_like:new event from',
                jupiter,
              );
              expect(msg, 'to be', null);
            });

            it("Mars doesn't get notifications about comment likes to Jupiter's comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                marsContext,
                'when subscribed to timeline',
                lunaTimeline,
                'with comment having id',
                jupiterComment.id,
                'not to get comment_like:new event from',
                lunaContext,
              );
              expect(msg, 'to be', null);
            });

            it('Jupiter gets notifications about comment likes to own comment', async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                jupiter,
                'when subscribed to timeline',
                lunaTimeline,
                'with comment having id',
                jupiterComment.id,
                'to get comment_like:new event from',
                lunaContext,
              );
              expect(
                msg,
                'to satisfy',
                commentHavingNLikesExpectation(1, false, lunaContext.user.id),
              );
            });

            it("Jupiter gets notifications about comment likes to Mars' comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                jupiter,
                'when subscribed to timeline',
                lunaTimeline,
                'with comment having id',
                marsComment.id,
                'to get comment_like:new event from',
                lunaContext,
              );
              expect(
                msg,
                'to satisfy',
                commentHavingNLikesExpectation(1, false, lunaContext.user.id),
              );
            });
          });
        });

        describe('via RiverOfNews timeline channel', () => {
          it('Luna gets notifications about comment likes to own comment', async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              lunaContext,
              'when subscribed to timeline',
              lunaRiverOfNews,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:new event from',
              marsContext,
            );
            expect(
              msg,
              'to satisfy',
              commentHavingNLikesExpectation(1, false, marsContext.user.id),
            );
          });

          it("Luna gets notifications about comment likes to Mars' comment", async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              lunaContext,
              'when subscribed to timeline',
              lunaRiverOfNews,
              'with comment having id',
              marsComment.id,
              'to get comment_like:new event from',
              lunaContext,
            );
            expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, true, lunaContext.user.id));
          });

          describe('when post is hidden by Mars', () => {
            beforeEach(async () => {
              await funcTestHelper.hidePost(lunaPost.id, marsContext);
            });

            describe("when subscribed to Mars's RiverOfNews", () => {
              it("Mars gets notifications about own comment likes to Luna's comment", async () => {
                const {
                  context: { commentLikeRealtimeMsg: msg },
                } = await expect(
                  marsContext,
                  'when subscribed to timeline',
                  marsRiverOfNews,
                  'with comment having id',
                  lunaComment.id,
                  'to get comment_like:new event from',
                  marsContext,
                );
                expect(
                  msg,
                  'to satisfy',
                  commentHavingNLikesExpectation(1, true, marsContext.user.id),
                );
              });

              it("Mars gets notifications about Jupiter's comment likes to Luna's comment", async () => {
                const {
                  context: { commentLikeRealtimeMsg: msg },
                } = await expect(
                  marsContext,
                  'when subscribed to timeline',
                  marsRiverOfNews,
                  'with comment having id',
                  lunaComment.id,
                  'to get comment_like:new event from',
                  jupiter,
                );
                expect(
                  msg,
                  'to satisfy',
                  commentHavingNLikesExpectation(1, false, jupiter.user.id),
                );
              });
            });
          });

          describe('when Jupiter is banned by Luna', () => {
            beforeEach(async () => {
              await funcTestHelper.banUser(lunaContext, jupiter);
            });

            it("Luna doesn't get notifications about comment likes to Jupiter comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                lunaContext,
                'when subscribed to timeline',
                lunaRiverOfNews,
                'with comment having id',
                jupiterComment.id,
                'not to get comment_like:new event from',
                marsContext,
              );
              expect(msg, 'to be', null);
            });

            it("Mars gets notifications about comment likes to Jupiter's comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                marsContext,
                'when subscribed to timeline',
                marsRiverOfNews,
                'with comment having id',
                jupiterComment.id,
                'to get comment_like:new event from',
                marsContext,
              );
              expect(
                msg,
                'to satisfy',
                commentHavingNLikesExpectation(1, true, marsContext.user.id),
              );
            });

            it("Luna doesn't get notifications about Jupiter's comment likes to own comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                lunaContext,
                'when subscribed to timeline',
                lunaRiverOfNews,
                'with comment having id',
                lunaComment.id,
                'not to get comment_like:new event from',
                jupiter,
              );
              expect(msg, 'to be', null);
            });
          });

          describe('when Jupiter is banned by Mars', () => {
            beforeEach(async () => {
              await funcTestHelper.banUser(marsContext, jupiter);
            });

            it("Mars doesn't get notifications about Jupiter's comment likes to Luna comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                marsContext,
                'when subscribed to timeline',
                marsRiverOfNews,
                'with comment having id',
                lunaComment.id,
                'not to get comment_like:new event from',
                jupiter,
              );
              expect(msg, 'to be', null);
            });

            it("Mars doesn't get notifications about comment likes to Jupiter's comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                marsContext,
                'when subscribed to timeline',
                marsRiverOfNews,
                'with comment having id',
                jupiterComment.id,
                'not to get comment_like:new event from',
                lunaContext,
              );
              expect(msg, 'to be', null);
            });
          });
        });

        describe('via Comments timeline channel', () => {
          it('Anonymous user gets notifications about comment likes', async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              anonContext,
              'when subscribed to timeline',
              lunaCommentsFeed,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:new event from',
              marsContext,
            );
            expect(
              msg,
              'to satisfy',
              commentHavingNLikesExpectation(1, false, marsContext.user.id),
            );
          });

          it('Luna gets notifications about comment likes to own comment', async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              lunaContext,
              'when subscribed to timeline',
              lunaCommentsFeed,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:new event from',
              marsContext,
            );
            expect(
              msg,
              'to satisfy',
              commentHavingNLikesExpectation(1, false, marsContext.user.id),
            );
          });

          it("Mars gets notifications about comment likes to Luna's comment", async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              marsContext,
              'when subscribed to timeline',
              lunaCommentsFeed,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:new event from',
              marsContext,
            );
            expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, true, marsContext.user.id));
          });

          it("Luna gets notifications about comment likes to Mars' comment", async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              lunaContext,
              'when subscribed to timeline',
              lunaCommentsFeed,
              'with comment having id',
              marsComment.id,
              'to get comment_like:new event from',
              jupiter,
            );
            expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, false, jupiter.user.id));
          });

          it("Luna gets notifications about comment likes to Mars' comment", async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              lunaContext,
              'when subscribed to timeline',
              lunaCommentsFeed,
              'with comment having id',
              marsComment.id,
              'to get comment_like:new event from',
              lunaContext,
            );
            expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, true, lunaContext.user.id));
          });

          describe('when post is hidden by Mars', () => {
            beforeEach(async () => {
              await funcTestHelper.hidePost(lunaPost.id, marsContext);
            });

            it("Mars gets notifications about own comment likes to Luna's comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                marsContext,
                'when subscribed to timeline',
                lunaCommentsFeed,
                'with comment having id',
                lunaComment.id,
                'to get comment_like:new event from',
                marsContext,
              );
              expect(
                msg,
                'to satisfy',
                commentHavingNLikesExpectation(1, true, marsContext.user.id),
              );
            });

            it("Mars gets notifications about Jupiter's comment likes to Luna's comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                marsContext,
                'when subscribed to timeline',
                lunaCommentsFeed,
                'with comment having id',
                lunaComment.id,
                'to get comment_like:new event from',
                jupiter,
              );
              expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, false, jupiter.user.id));
            });
          });

          describe('when Jupiter is banned by Luna', () => {
            beforeEach(async () => {
              await funcTestHelper.banUser(lunaContext, jupiter);
            });

            it("Luna doesn't get notifications about comment likes to Jupiter comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                lunaContext,
                'when subscribed to timeline',
                lunaCommentsFeed,
                'with comment having id',
                jupiterComment.id,
                'not to get comment_like:new event from',
                marsContext,
              );
              expect(msg, 'to be', null);
            });

            it("Mars gets notifications about comment likes to Jupiter's comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                marsContext,
                'when subscribed to timeline',
                marsCommentsFeed,
                'with comment having id',
                jupiterComment.id,
                'to get comment_like:new event from',
                marsContext,
              );
              expect(
                msg,
                'to satisfy',
                commentHavingNLikesExpectation(1, true, marsContext.user.id),
              );
            });

            it("Luna doesn't get notifications about Jupiter's comment likes to own comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                lunaContext,
                'when subscribed to timeline',
                lunaCommentsFeed,
                'with comment having id',
                lunaComment.id,
                'not to get comment_like:new event from',
                jupiter,
              );
              expect(msg, 'to be', null);
            });

            it("Jupiter doesn't get notifications about own comment likes to Luna's comment to Luna's post", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                jupiter,
                'when subscribed to timeline',
                lunaCommentsFeed,
                'with comment having id',
                lunaComment.id,
                'not to get comment_like:new event from',
                jupiter,
              );
              expect(msg, 'to be', null);
            });
          });

          describe('when Jupiter is banned by Mars', () => {
            beforeEach(async () => {
              await funcTestHelper.banUser(marsContext, jupiter);
            });

            it("Mars doesn't get notifications about Jupiter's comment likes to Luna comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                marsContext,
                'when subscribed to timeline',
                marsCommentsFeed,
                'with comment having id',
                lunaComment.id,
                'not to get comment_like:new event from',
                jupiter,
              );
              expect(msg, 'to be', null);
            });

            it("Mars doesn't get notifications about comment likes to Jupiter's comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                marsContext,
                'when subscribed to timeline',
                marsCommentsFeed,
                'with comment having id',
                jupiterComment.id,
                'not to get comment_like:new event from',
                lunaContext,
              );
              expect(msg, 'to be', null);
            });

            it('Jupiter gets notifications about comment likes to own comment', async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                jupiter,
                'when subscribed to timeline',
                marsCommentsFeed,
                'with comment having id',
                jupiterComment.id,
                'to get comment_like:new event from',
                lunaContext,
              );
              expect(
                msg,
                'to satisfy',
                commentHavingNLikesExpectation(1, false, lunaContext.user.id),
              );
            });

            it("Jupiter gets notifications about comment likes to Mars' comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                jupiter,
                'when subscribed to timeline',
                lunaCommentsFeed,
                'with comment having id',
                marsComment.id,
                'to get comment_like:new event from',
                lunaContext,
              );
              expect(
                msg,
                'to satisfy',
                commentHavingNLikesExpectation(1, false, lunaContext.user.id),
              );
            });
          });
        });
      });

      describe('for private post', () => {
        beforeEach(async () => {
          await funcTestHelper.mutualSubscriptions([lunaContext, marsContext]);
          await funcTestHelper.goPrivate(lunaContext);
        });

        describe('via Posts timeline channel', () => {
          it("Anonymous user doesn't get notifications about comment likes", async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              anonContext,
              'when subscribed to timeline',
              lunaTimeline,
              'with comment having id',
              lunaComment.id,
              'not to get comment_like:new event from',
              marsContext,
            );
            expect(msg, 'to be', null);
          });

          it("Anonymous user doesn't get notifications about comment likes", async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              anonContext,
              'when subscribed to timeline',
              marsTimeline,
              'with comment having id',
              marsComment.id,
              'not to get comment_like:new event from',
              jupiter,
            );
            expect(msg, 'to be', null);
          });

          it('Luna gets notifications about comment likes to own comment', async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              lunaContext,
              'when subscribed to timeline',
              lunaTimeline,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:new event from',
              marsContext,
            );
            expect(
              msg,
              'to satisfy',
              commentHavingNLikesExpectation(1, false, marsContext.user.id),
            );
          });

          it("Mars gets notifications about comment likes to Luna's comment", async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              marsContext,
              'when subscribed to timeline',
              lunaTimeline,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:new event from',
              marsContext,
            );
            expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, true, marsContext.user.id));
          });

          it("Jupiter doesn't get notifications about comment likes", async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              jupiter,
              'when subscribed to timeline',
              lunaTimeline,
              'with comment having id',
              lunaComment.id,
              'not to get comment_like:new event from',
              marsContext,
            );
            expect(msg, 'to be', null);
          });

          it("Jupiter doesn't get notifications about comment likes", async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              jupiter,
              'when subscribed to timeline',
              marsTimeline,
              'with comment having id',
              marsComment.id,
              'not to get comment_like:new event from',
              jupiter,
            );
            expect(msg, 'to be', null);
          });
        });

        describe('via RiverOfNews timeline channel', () => {
          it('Luna gets notifications about comment likes to own comment', async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              lunaContext,
              'when subscribed to timeline',
              lunaRiverOfNews,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:new event from',
              marsContext,
            );
            expect(
              msg,
              'to satisfy',
              commentHavingNLikesExpectation(1, false, marsContext.user.id),
            );
          });
        });

        describe('via Comments timeline channel', () => {
          it("Anonymous user doesn't get notifications about comment likes", async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              anonContext,
              'when subscribed to timeline',
              lunaCommentsFeed,
              'with comment having id',
              lunaComment.id,
              'not to get comment_like:new event from',
              marsContext,
            );
            expect(msg, 'to be', null);
          });

          it("Anonymous user doesn't get notifications about comment likes", async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              anonContext,
              'when subscribed to timeline',
              marsCommentsFeed,
              'with comment having id',
              marsComment.id,
              'not to get comment_like:new event from',
              jupiter,
            );
            expect(msg, 'to be', null);
          });

          it('Luna gets notifications about comment likes to own comment', async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              lunaContext,
              'when subscribed to timeline',
              lunaCommentsFeed,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:new event from',
              marsContext,
            );
            expect(
              msg,
              'to satisfy',
              commentHavingNLikesExpectation(1, false, marsContext.user.id),
            );
          });

          it("Mars gets notifications about comment likes to Luna's comment", async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              marsContext,
              'when subscribed to timeline',
              lunaCommentsFeed,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:new event from',
              marsContext,
            );
            expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, true, marsContext.user.id));
          });

          it("Jupiter doesn't get notifications about comment likes", async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              jupiter,
              'when subscribed to timeline',
              lunaCommentsFeed,
              'with comment having id',
              lunaComment.id,
              'not to get comment_like:new event from',
              marsContext,
            );
            expect(msg, 'to be', null);
          });

          it("Jupiter doesn't get notifications about comment likes", async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              jupiter,
              'when subscribed to timeline',
              marsCommentsFeed,
              'with comment having id',
              marsComment.id,
              'not to get comment_like:new event from',
              jupiter,
            );
            expect(msg, 'to be', null);
          });
        });

        describe('via post channel', () => {
          it("Anonymous user doesn't get notifications about comment likes", async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              anonContext,
              'when subscribed to post',
              lunaPost.id,
              'with comment having id',
              lunaComment.id,
              'not to get comment_like:new event from',
              marsContext,
            );
            expect(msg, 'to be', null);
          });

          it("Mars gets notifications about comment likes to Jupiter's comment", async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              marsContext,
              'when subscribed to post',
              lunaPost.id,
              'with comment having id',
              jupiterComment.id,
              'to get comment_like:new event from',
              lunaContext,
            );
            expect(
              msg,
              'to satisfy',
              commentHavingNLikesExpectation(1, false, lunaContext.user.id),
            );
          });

          it("Jupiter doesn't get notifications about comment likes to own comment to Luna's post", async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              jupiter,
              'when subscribed to post',
              lunaPost.id,
              'with comment having id',
              lunaComment.id,
              'not to get comment_like:new event from',
              marsContext,
            );
            expect(msg, 'to be', null);
          });
        });
      });
    });

    describe('comment_like:remove message', () => {
      beforeEach(async () => {
        const lunaCommentRes = await funcTestHelper.createCommentAsync(
          lunaContext,
          lunaPost.id,
          'Luna comment',
        );
        lunaComment = (await lunaCommentRes.json()).comments;
        await funcTestHelper.likeComment(lunaComment.id, marsContext);
      });

      describe('for public post', () => {
        describe('via post channel', () => {
          it('Anonymous user gets notifications about comment likes', async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              anonContext,
              'when subscribed to post',
              lunaPost.id,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:remove event from',
              marsContext,
            );
            expect(
              msg,
              'to satisfy',
              commentHavingNLikesExpectation(0, false, marsContext.user.id),
            );
          });

          it('Luna gets notifications about comment likes', async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              lunaContext,
              'when subscribed to post',
              lunaPost.id,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:remove event from',
              marsContext,
            );
            expect(
              msg,
              'to satisfy',
              commentHavingNLikesExpectation(0, false, marsContext.user.id),
            );
          });

          it('Mars gets notifications about comment likes', async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              marsContext,
              'when subscribed to post',
              lunaPost.id,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:remove event from',
              marsContext,
            );
            expect(
              msg,
              'to satisfy',
              commentHavingNLikesExpectation(0, false, marsContext.user.id),
            );
          });

          describe('when post is hidden', () => {
            beforeEach(async () => {
              await funcTestHelper.hidePost(lunaPost.id, marsContext);
            });

            it("Mars gets notifications about comment likes to Luna's comment", async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                marsContext,
                'when subscribed to post',
                lunaPost.id,
                'with comment having id',
                lunaComment.id,
                'to get comment_like:remove event from',
                marsContext,
              );
              expect(
                msg,
                'to satisfy',
                commentHavingNLikesExpectation(0, false, marsContext.user.id),
              );
            });
          });
        });

        describe('via Posts timeline channel', () => {
          it('Anonymous user gets notifications about comment likes', async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              anonContext,
              'when subscribed to timeline',
              lunaTimeline,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:remove event from',
              marsContext,
            );
            expect(
              msg,
              'to satisfy',
              commentHavingNLikesExpectation(0, false, marsContext.user.id),
            );
          });

          it('Luna gets notifications about comment likes', async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              lunaContext,
              'when subscribed to timeline',
              lunaTimeline,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:remove event from',
              marsContext,
            );
            expect(
              msg,
              'to satisfy',
              commentHavingNLikesExpectation(0, false, marsContext.user.id),
            );
          });

          it('Mars gets notifications about comment likes', async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              marsContext,
              'when subscribed to timeline',
              lunaTimeline,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:remove event from',
              marsContext,
            );
            expect(
              msg,
              'to satisfy',
              commentHavingNLikesExpectation(0, false, marsContext.user.id),
            );
          });

          describe('when post is hidden by Mars', () => {
            beforeEach(async () => {
              await funcTestHelper.hidePost(lunaPost.id, marsContext);
            });

            it('Mars gets notifications about comment likes', async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                marsContext,
                'when subscribed to timeline',
                lunaTimeline,
                'with comment having id',
                lunaComment.id,
                'to get comment_like:remove event from',
                marsContext,
              );
              expect(
                msg,
                'to satisfy',
                commentHavingNLikesExpectation(0, false, marsContext.user.id),
              );
            });
          });
        });

        describe('via RiverOfNews timeline channel', () => {
          it('Luna gets notifications about comment likes', async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              lunaContext,
              'when subscribed to timeline',
              lunaRiverOfNews,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:remove event from',
              marsContext,
            );
            expect(
              msg,
              'to satisfy',
              commentHavingNLikesExpectation(0, false, marsContext.user.id),
            );
          });

          describe('when post is hidden by Mars', () => {
            beforeEach(async () => {
              await funcTestHelper.hidePost(lunaPost.id, marsContext);
            });

            describe("when subscribed to Mars's RiverOfNews", () => {
              it('Mars gets notifications about comment likes', async () => {
                const {
                  context: { commentLikeRealtimeMsg: msg },
                } = await expect(
                  marsContext,
                  'when subscribed to timeline',
                  marsRiverOfNews,
                  'with comment having id',
                  lunaComment.id,
                  'to get comment_like:remove event from',
                  marsContext,
                );
                expect(
                  msg,
                  'to satisfy',
                  commentHavingNLikesExpectation(0, false, marsContext.user.id),
                );
              });
            });
          });
        });

        describe('via Comments timeline channel', () => {
          it('Anonymous user gets notifications about comment likes', async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              anonContext,
              'when subscribed to timeline',
              lunaCommentsFeed,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:remove event from',
              marsContext,
            );
            expect(
              msg,
              'to satisfy',
              commentHavingNLikesExpectation(0, false, marsContext.user.id),
            );
          });

          it('Luna gets notifications about comment likes', async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              lunaContext,
              'when subscribed to timeline',
              lunaCommentsFeed,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:remove event from',
              marsContext,
            );
            expect(
              msg,
              'to satisfy',
              commentHavingNLikesExpectation(0, false, marsContext.user.id),
            );
          });

          it('Mars gets notifications about comment likes', async () => {
            const {
              context: { commentLikeRealtimeMsg: msg },
            } = await expect(
              marsContext,
              'when subscribed to timeline',
              lunaCommentsFeed,
              'with comment having id',
              lunaComment.id,
              'to get comment_like:remove event from',
              marsContext,
            );
            expect(
              msg,
              'to satisfy',
              commentHavingNLikesExpectation(0, false, marsContext.user.id),
            );
          });

          describe('when post is hidden by Mars', () => {
            beforeEach(async () => {
              await funcTestHelper.hidePost(lunaPost.id, marsContext);
            });

            it('Mars gets notifications about comment likes', async () => {
              const {
                context: { commentLikeRealtimeMsg: msg },
              } = await expect(
                marsContext,
                'when subscribed to timeline',
                lunaCommentsFeed,
                'with comment having id',
                lunaComment.id,
                'to get comment_like:remove event from',
                marsContext,
              );
              expect(
                msg,
                'to satisfy',
                commentHavingNLikesExpectation(0, false, marsContext.user.id),
              );
            });
          });
        });
      });
    });

    describe('when comment created or updated', () => {
      it('Mars gets notifications about new comments with comment likes fields', async () => {
        const {
          context: { commentRealtimeMsg: msg },
        } = await expect(
          marsContext,
          'when subscribed to timeline',
          lunaTimeline,
          'with post having id',
          lunaPost.id,
          'to get comment:* events from',
          lunaContext,
        );

        expect(msg, 'to satisfy', {
          comments: {
            likes: 0,
            hasOwnLike: false,
          },
        });
        expect(msg.comments, 'not to have key', 'userId');
      });

      it('Mars gets notifications about updated comments with comment likes fields', async () => {
        const lunaCommentRes = await funcTestHelper.createCommentAsync(
          lunaContext,
          lunaPost.id,
          'Luna comment',
        );
        lunaComment = (await lunaCommentRes.json()).comments;
        await funcTestHelper.likeComment(lunaComment.id, marsContext);

        const {
          context: { commentRealtimeMsg: msg },
        } = await expect(
          marsContext,
          'when subscribed to timeline',
          lunaTimeline,
          'with comment having id',
          lunaComment.id,
          'to get comment:update events from',
          lunaContext,
        );

        expect(msg, 'to satisfy', {
          comments: {
            likes: 1,
            hasOwnLike: true,
          },
        });
        expect(msg.comments, 'not to have key', 'userId');
      });
    });

    describe('when post created or updated', () => {
      it('Mars gets notifications about new posts with comment likes fields', async () => {
        const {
          context: { newPostRealtimeMsg: msg },
        } = await expect(
          marsContext,
          'when subscribed to timeline',
          lunaTimeline,
          'with post having id',
          lunaPost.id,
          'to get post:* events from',
          lunaContext,
        );

        expect(msg, 'to satisfy', {
          posts: {
            commentLikes: 0,
            ownCommentLikes: 0,
            omittedCommentLikes: 0,
            omittedOwnCommentLikes: 0,
            comments: [],
          },
        });
      });

      it('Mars gets notifications about updated posts with comment likes fields', async () => {
        const lunaCommentRes = await funcTestHelper.createCommentAsync(
          lunaContext,
          lunaPost.id,
          'Luna comment',
        );
        lunaComment = (await lunaCommentRes.json()).comments;
        await funcTestHelper.likeComment(lunaComment.id, marsContext);

        const {
          context: { postUpdateRealtimeMsg: msg },
        } = await expect(
          marsContext,
          'when subscribed to timeline',
          lunaTimeline,
          'with post having id',
          lunaPost.id,
          'to get post:update events from',
          lunaContext,
        );

        expect(msg, 'to satisfy', {
          posts: {
            commentLikes: 1,
            ownCommentLikes: 1,
            omittedCommentLikes: 0,
            omittedOwnCommentLikes: 0,
          },
          comments: [
            {
              likes: 1,
              hasOwnLike: true,
            },
          ],
        });
      });
    });
  });

  describe('Authorization inside the realtime session', () => {
    describe('Mars is a private user', () => {
      beforeEach(async () => {
        await funcTestHelper.goPrivate(marsContext);
      });

      it('Anonymous does not get notifications about his posts', () =>
        expect(
          anonContext,
          'when subscribed to timeline',
          marsTimeline,
          'not to get post:* events from',
          marsContext,
        ));

      it('Mars gets notifications about his posts', () =>
        expect(
          anonContext,
          'when subscribed to timeline',
          marsTimeline,
          'when authorized as',
          marsContext,
          'to get post:* events from',
          marsContext,
        ));

      it('Luna does not gets notifications about his posts', () =>
        expect(
          anonContext,
          'when subscribed to timeline',
          marsTimeline,
          'when authorized as',
          lunaContext,
          'not to get post:* events from',
          marsContext,
        ));

      it('Luna re-auth as Mars and gets notifications about his posts', () =>
        expect(
          anonContext,
          'when subscribed to timeline',
          marsTimeline,
          'when authorized as',
          lunaContext,
          'when authorized as',
          marsContext,
          'to get post:* events from',
          marsContext,
        ));

      it('Mars signed out and does not get notifications about his posts', () =>
        expect(
          anonContext,
          'when subscribed to timeline',
          marsTimeline,
          'when authorized as',
          marsContext,
          'when authorized as',
          anonContext,
          'not to get post:* events from',
          marsContext,
        ));
    });
  });
});
