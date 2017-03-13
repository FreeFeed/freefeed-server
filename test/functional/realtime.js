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

    it('Luna gets notifications about comment likes to own post', () =>
      expect(lunaContext,
        'when subscribed to post', lunaPost.id,
        'with comment having id', lunaComment.id,
        'to get comment_like:new event from', marsContext
      )
    );
  });
});
