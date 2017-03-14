/* eslint-env node, mocha */
/* global $database, $pg_database */
import knexCleaner from 'knex-cleaner';
import origExpect from 'unexpected';

import { getSingleton } from '../../app/app';
import { dbAdapter, PubSub } from '../../app/models';
import { PubSubAdapter } from '../../app/support/PubSubAdapter'

import * as funcTestHelper from './functional_test_helper';
import * as realtimeAssertions from './realtime_assertions';

const expect = origExpect.clone().use(realtimeAssertions);

describe('Realtime (Socket.io)', () => {
  before(async () => {
    await getSingleton();
    const pubsubAdapter = new PubSubAdapter($database)
    PubSub.setPublisher(pubsubAdapter)
  });

  let lunaContext = {};
  let marsContext = {};
  let marsTimeline = null;
  let lunaTimeline = null;
  const anonContext = { authToken: '' }

  beforeEach(async () => {
    await knexCleaner.clean($pg_database);

    [lunaContext, marsContext] = await Promise.all([
      funcTestHelper.createUserAsync('luna', 'pw'),
      funcTestHelper.createUserAsync('mars', 'pw'),
    ]);

    [{ Posts: lunaTimeline }, { Posts: marsTimeline }] = await Promise.all([
      dbAdapter.getUserTimelinesIds(lunaContext.user.id),
      dbAdapter.getUserTimelinesIds(marsContext.user.id),
    ]);
  })

  describe('User timeline', () => {
    it(
      'Luna gets notifications about public posts',
      () => expect(lunaContext, 'when subscribed to timeline', marsTimeline, 'to get post:* events from', marsContext)
    );

    it(
      'Anonymous user gets notifications about public posts',
      () => expect(anonContext, 'when subscribed to timeline', marsTimeline, 'to get post:* events from', marsContext)
    );

    describe('Mars is a private user', () => {
      beforeEach(async () => {
        await funcTestHelper.goPrivate(marsContext)
      });

      it(
        'Luna does not get notifications about his posts',
        () => expect(lunaContext, 'when subscribed to timeline', marsTimeline, 'not to get post:* events from', marsContext)
      );

      describe('Mars accepted luna\'s subscription request', () => {
        beforeEach(async () => {
          await funcTestHelper.sendRequestToSubscribe(lunaContext, marsContext)
          await funcTestHelper.acceptRequestAsync(marsContext, lunaContext)
        });

        it(
          'Luna gets notifications about his posts',
          () => expect(lunaContext, 'when subscribed to timeline', marsTimeline, 'to get post:* events from', marsContext)
        );
      });
    });

    describe('Mars blocked luna', () => {
      beforeEach(async () => {
        await funcTestHelper.banUser(marsContext, lunaContext)
      });

      it(
        'Luna does not get notifications about his posts',
        () => expect(lunaContext, 'when subscribed to timeline', marsTimeline, 'not to get post:* events from', marsContext)
      );

      it(
        'Mars does not get notifications about her posts',
        () => expect(marsContext, 'when subscribed to timeline', lunaTimeline, 'not to get post:* events from', lunaContext)
      );

      describe('Reactions', () => {
        let venusContext = {};
        let venusTimeline = null;
        let postId;

        beforeEach(async () => {
          venusContext = await funcTestHelper.createUserAsync('venus', 'pw');
          [
            { id: postId },
            { Posts: venusTimeline },
          ] = await Promise.all([
            funcTestHelper.createAndReturnPost(venusContext, 'test post'),
            dbAdapter.getUserTimelinesIds(venusContext.user.id),
          ]);
        });

        it('Mars does not get notifications about her likes',
          () => expect(marsContext,
            'when subscribed to timeline', venusTimeline,
            'with post having id', postId,
            'not to get like:* events from', lunaContext
          )
        );

        it('Mars does not get notifications about her comments',
          () => expect(marsContext,
            'when subscribed to timeline', venusTimeline,
            'with post having id', postId,
            'not to get comment:* events from', lunaContext
          )
        );
      });
    });
  });

  describe('Comment likes', () => {
    let jupiter;
    let lunaPost;
    let lunaComment, marsComment, jupiterComment;

    const commentHavingNLikesExpectation = (nLikes, hasOwn, likerId) => async (obj) => {
      expect(obj, 'to satisfy', {
        comments: {
          likes:      nLikes,
          hasOwnLike: hasOwn,
          userId:     likerId
        }
      });
    };

    beforeEach(async () => {
      jupiter = await funcTestHelper.createUserAsync('jupiter', 'pw');
      lunaPost = await funcTestHelper.createAndReturnPost(lunaContext, 'Luna post');
      const [lunaCommentRes, marsCommentRes, jupiterCommentRes] = await Promise.all([
        funcTestHelper.createCommentAsync(lunaContext, lunaPost.id, 'Luna comment'),
        funcTestHelper.createCommentAsync(marsContext, lunaPost.id, 'Mars comment'),
        funcTestHelper.createCommentAsync(jupiter, lunaPost.id, 'Jupiter comment'),
      ]);
      [{ comments: lunaComment }, { comments: marsComment }, { comments: jupiterComment }] = await Promise.all([
        lunaCommentRes.json(),
        marsCommentRes.json(),
        jupiterCommentRes.json(),
      ]);

      await funcTestHelper.mutualSubscriptions([lunaContext, marsContext]);
    });

    describe('for public post', () => {
      describe('via post channel', () => {
        it('Anonymous user gets notifications about comment likes', async () => {
          const { context: { commentLikeRealtimeMsg: msg } } = await expect(anonContext,
            'when subscribed to post', lunaPost.id,
            'with comment having id', lunaComment.id,
            'to get comment_like:new event from', marsContext
          );
          expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, false, marsContext.user.id));
        });

        it('Luna gets notifications about comment likes to own comment', async () => {
          const { context: { commentLikeRealtimeMsg: msg } } = await expect(lunaContext,
            'when subscribed to post', lunaPost.id,
            'with comment having id', lunaComment.id,
            'to get comment_like:new event from', marsContext
          );
          expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, false, marsContext.user.id));
        });

        it("Luna gets notifications about comment likes to Mars' comment", async () => {
          const { context: { commentLikeRealtimeMsg: msg } } = await expect(lunaContext,
            'when subscribed to post', lunaPost.id,
            'with comment having id', marsComment.id,
            'to get comment_like:new event from', jupiter
          );
          expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, false, jupiter.user.id));
        });

        it("Luna gets notifications about comment likes to Mars' comment", async () => {
          const { context: { commentLikeRealtimeMsg: msg } } = await expect(lunaContext,
            'when subscribed to post', lunaPost.id,
            'with comment having id', marsComment.id,
            'to get comment_like:new event from', lunaContext
          );
          expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, true, lunaContext.user.id));
        });

        it("Mars gets notifications about comment likes to Luna's comment", async () => {
          const { context: { commentLikeRealtimeMsg: msg } } = await expect(marsContext,
            'when subscribed to post', lunaPost.id,
            'with comment having id', lunaComment.id,
            'to get comment_like:new event from', marsContext
          );
          expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, true, marsContext.user.id));
        });

        describe('when post is hidden', () => {
          beforeEach(async () => {
            await funcTestHelper.hidePost(lunaPost.id, marsContext);
          });

          it("Mars gets notifications about comment likes to Luna's comment", async () => {
            const { context: { commentLikeRealtimeMsg: msg } } = await expect(marsContext,
              'when subscribed to post', lunaPost.id,
              'with comment having id', lunaComment.id,
              'to get comment_like:new event from', marsContext
            );
            expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, true, marsContext.user.id));
          });
        });

        describe('when Jupiter is banned by Luna', () => {
          beforeEach(async () => {
            await funcTestHelper.banUser(lunaContext, jupiter);
            await funcTestHelper.likeComment(lunaComment.id, marsContext);
          });

          it("Luna doesn't get notifications about comment likes to Jupiter comment", async () => {
            const { context: { commentLikeRealtimeMsg: msg } } = await expect(lunaContext,
              'when subscribed to post', lunaPost.id,
              'with comment having id', jupiterComment.id,
              'not to get comment_like:new event from', marsContext
            );
            expect(msg, 'to be', null);
          });

          it("Mars gets notifications about comment likes to Jupiter's comment", async () => {
            const { context: { commentLikeRealtimeMsg: msg } } = await expect(marsContext,
              'when subscribed to post', lunaPost.id,
              'with comment having id', jupiterComment.id,
              'to get comment_like:new event from', marsContext
            );
            expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, true, marsContext.user.id));
          });

          it("Luna doesn't get notifications about Jupiter's comment likes to own comment", async () => {
            const { context: { commentLikeRealtimeMsg: msg } } = await expect(lunaContext,
              'when subscribed to post', lunaPost.id,
              'with comment having id', lunaComment.id,
              'not to get comment_like:new event from', jupiter
            );
            expect(msg, 'to be', null);
          });

          it("Jupiter doesn't get notifications about own comment likes to Luna's comment to Luna's post", async () => {
            const { context: { commentLikeRealtimeMsg: msg } } = await expect(jupiter,
              'when subscribed to post', lunaPost.id,
              'with comment having id', lunaComment.id,
              'not to get comment_like:new event from', jupiter
            );
            expect(msg, 'to be', null);
          });
        });

        describe('when Jupiter is banned by Mars', () => {
          beforeEach(async () => {
            await funcTestHelper.banUser(marsContext, jupiter);
            await funcTestHelper.likeComment(lunaComment.id, marsContext);
          });

          it("Mars doesn't get notifications about Jupiter's comment likes to Luna comment", async () => {
            const { context: { commentLikeRealtimeMsg: msg } } = await expect(marsContext,
              'when subscribed to post', lunaPost.id,
              'with comment having id', lunaComment.id,
              'not to get comment_like:new event from', jupiter
            );
            expect(msg, 'to be', null);
          });

          it("Mars doesn't get notifications about comment likes to Jupiter's comment", async () => {
            const { context: { commentLikeRealtimeMsg: msg } } = await expect(marsContext,
              'when subscribed to post', lunaPost.id,
              'with comment having id', jupiterComment.id,
              'not to get comment_like:new event from', lunaContext
            );
            expect(msg, 'to be', null);
          });

          it('Jupiter gets notifications about comment likes to own comment', async () => {
            const { context: { commentLikeRealtimeMsg: msg } } = await expect(jupiter,
              'when subscribed to post', lunaPost.id,
              'with comment having id', jupiterComment.id,
              'to get comment_like:new event from', lunaContext
            );
            expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, false, lunaContext.user.id));
          });

          it("Jupiter gets notifications about comment likes to Mars' comment", async () => {
            const { context: { commentLikeRealtimeMsg: msg } } = await expect(jupiter,
              'when subscribed to post', lunaPost.id,
              'with comment having id', marsComment.id,
              'to get comment_like:new event from', lunaContext
            );
            expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, false, lunaContext.user.id));
          });
        });
      });
    });

    describe('for private post', () => {
      describe('via post channel', () => {
        beforeEach(async () => {
          await funcTestHelper.mutualSubscriptions([lunaContext, marsContext]);
          await funcTestHelper.goPrivate(lunaContext);
        });

        it("Anonymous user doesn't get notifications about comment likes", async () => {
          const { context: { commentLikeRealtimeMsg: msg } } = await expect(anonContext,
            'when subscribed to post', lunaPost.id,
            'with comment having id', lunaComment.id,
            'not to get comment_like:new event from', marsContext
          );
          expect(msg, 'to be', null);
        });

        it("Mars gets notifications about comment likes to Jupiter's comment", async () => {
          const { context: { commentLikeRealtimeMsg: msg } } = await expect(marsContext,
            'when subscribed to post', lunaPost.id,
            'with comment having id', jupiterComment.id,
            'to get comment_like:new event from', lunaContext
          );
          expect(msg, 'to satisfy', commentHavingNLikesExpectation(1, false, lunaContext.user.id));
        });

        it("Jupiter doesn't get notifications about comment likes to own comment to Luna's post", async () => {
          const { context: { commentLikeRealtimeMsg: msg } } = await expect(jupiter,
            'when subscribed to post', lunaPost.id,
            'with comment having id', lunaComment.id,
            'not to get comment_like:new event from', marsContext
          );
          expect(msg, 'to be', null);
        });
      });
    });
  });
});
