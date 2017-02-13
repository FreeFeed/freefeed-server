/* eslint-env node, mocha */
/* global $pg_database */

import fetch from 'node-fetch'
import knexCleaner from 'knex-cleaner'
import expect from 'unexpected'
import uuid from 'uuid'
import validator from 'validator'

import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub } from '../../app/models'
import {
  acceptRequestToJoinGroup,
  banUser,
  createAndReturnPost,
  createAndReturnPostToFeed,
  createCommentAsync,
  createGroupAsync,
  createUserAsync,
  mutualSubscriptions,
  sendRequestToJoinGroup
} from './functional_test_helper'
import * as schema from './schemaV2-helper'


describe('Comment likes', () => {
  let app;
  let likeComment, writeComment;

  before(async () => {
    app = await getSingleton();
    likeComment = createCommentLike(app);
    writeComment = createComment();
    PubSub.setPublisher(new DummyPublisher());
  });

  beforeEach(async () => {
    await knexCleaner.clean($pg_database);
  });

  describe('CommentLikesController', () => {
    describe('#like', () => {
      it('should reject unauthenticated users', async () => {
        const res = await likeComment(uuid.v4());
        expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'Unauthorized'));
      });

      describe('for authenticated users', () => {
        describe('public users Luna, Mars and stranger Jupiter', () => {
          let luna, mars, jupiter;
          let lunaPost, marsPost;

          beforeEach(async () => {
            [luna, mars, jupiter] = await Promise.all([
              createUserAsync('luna', 'pw'),
              createUserAsync('mars', 'pw'),
              createUserAsync('jupiter', 'pw'),
            ]);
            [lunaPost, marsPost] = await Promise.all([
              createAndReturnPost(luna, 'Luna post'),
              createAndReturnPost(mars, 'Mars post')
            ]);
            await mutualSubscriptions([luna, mars]);
          });

          it('should not allow to like nonexisting comment', async () => {
            const res = await likeComment(uuid.v4(), luna);
            expect(res, 'to exhaustively satisfy', apiErrorExpectation(404, "Can't find comment"));
          });

          it('should not allow to like own comments to own post', async () => {
            const lunaComment = await writeComment(luna, lunaPost.id, 'Luna comment');
            const res = await likeComment(lunaComment.id, luna);
            expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, "You can't like your own comment"));
          });

          it('should not allow to like own comments to other user post', async () => {
            const lunaComment = await writeComment(luna, marsPost.id, 'Luna comment');
            const res = await likeComment(lunaComment.id, luna);
            expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, "You can't like your own comment"));
          });

          it("should allow Luna to like Mars' comment to Luna's post", async () => {
            const marsComment = await writeComment(mars, lunaPost.id, 'Mars comment');
            const res = await likeComment(marsComment.id, luna);
            expect(res, 'to satisfy', commentHavingOneLikeExpectation(luna));
          });

          it("should allow Luna to like Mars' comment to Mars' post", async () => {
            const marsComment = await writeComment(mars, marsPost.id, 'Mars comment');
            const res = await likeComment(marsComment.id, luna);
            expect(res, 'to satisfy', commentHavingOneLikeExpectation(luna));
          });

          it("should allow Jupiter to like Mars' comment to Luna's post", async () => {
            const marsComment = await writeComment(mars, lunaPost.id, 'Mars comment');
            const res = await likeComment(marsComment.id, jupiter);
            expect(res, 'to satisfy', commentHavingOneLikeExpectation(jupiter));
          });

          it('should not allow to like comment more than one time', async () => {
            const marsComment = await writeComment(mars, lunaPost.id, 'Mars comment');
            const res1 = await likeComment(marsComment.id, luna);
            expect(res1.status, 'to be', 200);

            const res2 = await likeComment(marsComment.id, luna);
            expect(res2, 'to exhaustively satisfy', apiErrorExpectation(403, "You can't like comment that you have already liked"));
          });

          describe('comment likes sorting', () => {
            let pluto;

            beforeEach(async () => {
              pluto = await createUserAsync('pluto', 'pw');
            });

            it('should sort comment likes chronologically descending (except viewer)', async () => {
              const lunaComment = await writeComment(luna, lunaPost.id, 'Luna comment');
              let res = await likeComment(lunaComment.id, mars);
              expect(res, 'to satisfy', commentHavingOneLikeExpectation(mars));
              await likeComment(lunaComment.id, jupiter);
              res = await likeComment(lunaComment.id, pluto);

              expect(res, 'to satisfy', { status: 200 });
              const responseJson = await res.json();

              expect(responseJson, 'to satisfy', {
                likes: expect.it('to be an array').and('to be non-empty').and('to have length', 3),
                users: expect.it('to be an array').and('to have items satisfying', schema.user)
              });

              expect(responseJson.likes[0].userId, 'to be', pluto.user.id);
              expect(responseJson.likes[1].userId, 'to be', jupiter.user.id);
              expect(responseJson.likes[2].userId, 'to be', mars.user.id);
            });
          });

          describe('when Luna bans Mars and stranger Pluto', () => {
            let pluto;
            let plutoPost;

            beforeEach(async () => {
              pluto = await createUserAsync('pluto', 'pw');
              plutoPost = await createAndReturnPost(pluto, 'Pluto post');
              await Promise.all([
                banUser(luna, mars),
                banUser(luna, pluto)
              ]);
            });

            it("should not allow Luna to like Mars' comment to Mars' post", async () => {
              const marsComment = await writeComment(mars, marsPost.id, 'Mars comment');
              const res = await likeComment(marsComment.id, luna);
              expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You have banned the author of this comment'));
            });

            it("should not allow Luna to like Pluto's comment to Pluto's post", async () => {
              const plutoComment = await writeComment(pluto, plutoPost.id, 'Pluto comment');
              const res = await likeComment(plutoComment.id, luna);
              expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You have banned the author of this comment'));
            });

            it("should not allow Luna to like Pluto's comment to Mars' post", async () => {
              const plutoComment = await writeComment(pluto, marsPost.id, 'Pluto comment');
              const res = await likeComment(plutoComment.id, luna);
              expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You have banned the author of this comment'));
            });

            it("should allow Mars to like Luna's comment to Luna's post", async () => {
              const lunaComment = await writeComment(luna, lunaPost.id, 'Luna comment');
              const res = await likeComment(lunaComment.id, mars);
              expect(res, 'to satisfy', commentHavingOneLikeExpectation(mars));
            });

            it("should allow Pluto to like Luna's comment to Luna's post", async () => {
              const lunaComment = await writeComment(luna, lunaPost.id, 'Luna comment');
              const res = await likeComment(lunaComment.id, pluto);
              expect(res, 'to satisfy', commentHavingOneLikeExpectation(pluto));
            });

            it("should allow Pluto to like Jupiter's comment to Luna's post", async () => {
              const jupiterComment = await writeComment(jupiter, lunaPost.id, 'Jupiter comment');
              const res = await likeComment(jupiterComment.id, pluto);
              expect(res, 'to satisfy', commentHavingOneLikeExpectation(pluto));
            });

            it('should not display Luna comment likes of Pluto and Mars', async () => {
              const jupiterPost = await createAndReturnPost(jupiter, 'Jupiter post');
              const jupiterComment = await writeComment(jupiter, jupiterPost.id, 'Jupiter comment');
              let res = await likeComment(jupiterComment.id, pluto);
              expect(res, 'to satisfy', commentHavingOneLikeExpectation(pluto));
              await likeComment(jupiterComment.id, mars);
              res = await likeComment(jupiterComment.id, luna);
              expect(res, 'to satisfy', commentHavingOneLikeExpectation(luna));
            });
          });

          describe('public group Dubhe, public restricted group Merak, private group Phad, private restricted group Alkaid', () => {
            let dubhe, merak, phad, alkaid;
            let dubhePost, merakPost, phadPost, alkaidPost;
            beforeEach(async () => {
              [dubhe, merak, phad, alkaid] = await Promise.all([
                createGroupAsync(luna, 'dubhe',  'Dubhe',  false, false),
                createGroupAsync(luna, 'merak',  'Merak',  false, true),
                createGroupAsync(luna, 'phad',   'Phad',   true,  false),
                createGroupAsync(luna, 'alkaid', 'Alkaid', true,  true),
              ]);

              [dubhePost, merakPost, phadPost, alkaidPost] = await Promise.all([
                createAndReturnPostToFeed(dubhe,  luna, 'Dubhe post'),
                createAndReturnPostToFeed(merak,  luna, 'Merak post'),
                createAndReturnPostToFeed(phad,   luna, 'Phad post'),
                createAndReturnPostToFeed(alkaid, luna, 'Alkaid post')
              ]);
              await sendRequestToJoinGroup(mars, phad);
              await acceptRequestToJoinGroup(luna, mars, phad);
              await sendRequestToJoinGroup(mars, alkaid);
              await acceptRequestToJoinGroup(luna, mars, alkaid);
            });

            it('should allow any user to like comment in a public group', async () => {
              const marsComment = await writeComment(mars, dubhePost.id, 'Mars comment');
              const res = await likeComment(marsComment.id, jupiter);
              expect(res, 'to satisfy', commentHavingOneLikeExpectation(jupiter));
            });

            it('should allow any user to like comment in a public restricted group', async () => {
              const marsComment = await writeComment(mars, merakPost.id, 'Mars comment');
              const res = await likeComment(marsComment.id, jupiter);
              expect(res, 'to satisfy', commentHavingOneLikeExpectation(jupiter));
            });

            it('should allow members to like comment in a private group', async () => {
              const marsComment = await writeComment(mars, phadPost.id, 'Mars comment');
              const res = await likeComment(marsComment.id, luna);
              expect(res, 'to satisfy', commentHavingOneLikeExpectation(luna));
            });

            it('should not allow non-members to like comment in a private group', async () => {
              const marsComment = await writeComment(mars, phadPost.id, 'Mars comment');
              const res = await likeComment(marsComment.id, jupiter);
              expect(res, 'to exhaustively satisfy', apiErrorExpectation(404, "Can't find post"));
            });

            it('should allow members to like comment in a private restricted group', async () => {
              const marsComment = await writeComment(mars, alkaidPost.id, 'Mars comment');
              const res = await likeComment(marsComment.id, luna);
              expect(res, 'to satisfy', commentHavingOneLikeExpectation(luna));
            });

            it('should not allow non-members to like comment in a private restricted group', async () => {
              const marsComment = await writeComment(mars, alkaidPost.id, 'Mars comment');
              const res = await likeComment(marsComment.id, jupiter);
              expect(res, 'to exhaustively satisfy', apiErrorExpectation(404, "Can't find post"));
            });
          });
        });
      });
    });
  });
});

const createCommentLike = (app) => async (commentId, likerContext = null) => {
  const headers = {} ;
  if (likerContext) {
    headers['X-Authentication-Token'] = likerContext.authToken;
  }
  const response = await fetch(`${app.context.config.host}/v2/comments/${commentId}/like`, { method: 'POST', headers });
  return response;
};

const createComment = () => async (userContext, postId, body) => {
  const response = await createCommentAsync(userContext, postId, body);
  const commentData = await response.json();
  return commentData.comments;
};

const commentHavingOneLikeExpectation = (liker) => async (obj) => {
  expect(obj, 'to satisfy', { status: 200 });
  const responseJson = await obj.json();

  expect(responseJson, 'to satisfy', {
    likes: expect.it('to be an array')
             .and('to be non-empty')
             .and('to have length', 1)
             .and('to have items satisfying', {
               userId:    expect.it('to satisfy', schema.UUID).and('to be', liker.user.id),
               createdAt: expect.it('when passed as parameter to', validator.isISO8601, 'to be', true)
             }),
    users: expect.it('to be an array').and('to have items satisfying', schema.user)
  });
};

const apiErrorExpectation = (code, message) => async (obj) => {
  expect(obj, 'to satisfy', { status: code });
  const responseJson = await obj.json();
  expect(responseJson, 'to satisfy', { err: message });
};
