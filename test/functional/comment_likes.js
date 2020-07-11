/* eslint-env node, mocha */
/* global $pg_database */

import fetch from 'node-fetch'
import expect from 'unexpected'
import { v4 as uuidv4 } from 'uuid';
import validator from 'validator'

import cleanDB from '../dbCleaner'
import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub } from '../../app/models'

import {
  acceptRequestToJoinGroup,
  banUser,
  createAndReturnPost,
  createAndReturnPostToFeed,
  createCommentAsync,
  likeComment,
  createGroupAsync,
  createUserAsync,
  unlikeComment,
  getCommentLikes,
  like,
  mutualSubscriptions,
  sendRequestToJoinGroup,
  performSearch,
  updateUserAsync
} from './functional_test_helper'
import * as schema from './schemaV2-helper'


describe('Comment likes', () => {
  let app;
  let writeComment, getPost, getFeed;

  before(async () => {
    app = await getSingleton();
    writeComment = createComment();
    getPost = fetchPost(app);
    getFeed = fetchTimeline(app);
    PubSub.setPublisher(new DummyPublisher());
  });

  beforeEach(() => cleanDB($pg_database));

  describe('CommentLikesController', () => {
    describe('#like', () => {
      it('should reject unauthenticated users', async () => {
        const res = await likeComment(uuidv4());
        expect(res, 'to exhaustively satisfy', apiErrorExpectation(401, 'Unauthorized'));
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
            const res = await likeComment(uuidv4(), luna);
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
              expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You can not see this post'));
            });

            it("should not allow Luna to like Pluto's comment to Pluto's post", async () => {
              const plutoComment = await writeComment(pluto, plutoPost.id, 'Pluto comment');
              const res = await likeComment(plutoComment.id, luna);
              expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You can not see this post'));
            });

            it("should not allow Luna to like Pluto's comment to Mars' post", async () => {
              const plutoComment = await writeComment(pluto, marsPost.id, 'Pluto comment');
              const res = await likeComment(plutoComment.id, luna);
              expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You can not see this post'));
            });

            it("should not allow Mars to like Luna's comment to Luna's post", async () => {
              const lunaComment = await writeComment(luna, lunaPost.id, 'Luna comment');
              const res = await likeComment(lunaComment.id, mars);
              expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You can not see this post'));
            });

            it("should not allow Pluto to like Luna's comment to Luna's post", async () => {
              const lunaComment = await writeComment(luna, lunaPost.id, 'Luna comment');
              const res = await likeComment(lunaComment.id, pluto);
              expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You can not see this post'));
            });

            it("should not allow Pluto to like Jupiter's comment to Luna's post", async () => {
              const jupiterComment = await writeComment(jupiter, lunaPost.id, 'Jupiter comment');
              const res = await likeComment(jupiterComment.id, pluto);
              expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You can not see this post'));
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
              expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You can not see this post'));
            });

            it('should allow members to like comment in a private restricted group', async () => {
              const marsComment = await writeComment(mars, alkaidPost.id, 'Mars comment');
              const res = await likeComment(marsComment.id, luna);
              expect(res, 'to satisfy', commentHavingOneLikeExpectation(luna));
            });

            it('should not allow non-members to like comment in a private restricted group', async () => {
              const marsComment = await writeComment(mars, alkaidPost.id, 'Mars comment');
              const res = await likeComment(marsComment.id, jupiter);
              expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You can not see this post'));
            });
          });
        });
      });
    });

    describe('#unlike', () => {
      it('should reject unauthenticated users', async () => {
        const res = await unlikeComment(uuidv4());
        expect(res, 'to exhaustively satisfy', apiErrorExpectation(401, 'Unauthorized'));
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

          it('should not allow to unlike nonexisting comment', async () => {
            const res = await unlikeComment(uuidv4(), luna);
            expect(res, 'to exhaustively satisfy', apiErrorExpectation(404, "Can't find comment"));
          });

          it('should not allow to unlike own comments to own post', async () => {
            const lunaComment = await writeComment(luna, lunaPost.id, 'Luna comment');
            const res = await unlikeComment(lunaComment.id, luna);
            expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, "You can't un-like your own comment"));
          });

          it('should not allow to unlike own comments to other user post', async () => {
            const lunaComment = await writeComment(luna, marsPost.id, 'Luna comment');
            const res = await unlikeComment(lunaComment.id, luna);
            expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, "You can't un-like your own comment"));
          });

          it("should allow Luna to unlike Mars' comment to Luna's post", async () => {
            const marsComment = await writeComment(mars, lunaPost.id, 'Mars comment');
            await likeComment(marsComment.id, luna);
            const res = await unlikeComment(marsComment.id, luna);
            expect(res, 'to satisfy', commentHavingNoLikesExpectation);
          });

          it("should allow Luna to unlike Mars' comment to Mars' post", async () => {
            const marsComment = await writeComment(mars, marsPost.id, 'Mars comment');
            await likeComment(marsComment.id, luna);
            const res = await unlikeComment(marsComment.id, luna);
            expect(res, 'to satisfy', commentHavingNoLikesExpectation);
          });

          it("should allow Jupiter to unlike Mars' comment to Luna's post", async () => {
            const marsComment = await writeComment(mars, lunaPost.id, 'Mars comment');
            await likeComment(marsComment.id, jupiter);
            const res = await unlikeComment(marsComment.id, jupiter);
            expect(res, 'to satisfy', commentHavingNoLikesExpectation);
          });

          it("should not allow to unlike comment that haven't been liked", async () => {
            const marsComment = await writeComment(mars, lunaPost.id, 'Mars comment');
            const res = await unlikeComment(marsComment.id, luna);
            expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, "You can't un-like comment that you haven't yet liked"));
          });

          it('should not allow to unlike comment more than one time', async () => {
            const marsComment = await writeComment(mars, lunaPost.id, 'Mars comment');
            await likeComment(marsComment.id, luna);
            const res1 = await unlikeComment(marsComment.id, luna);
            expect(res1, 'to satisfy', commentHavingNoLikesExpectation);

            const res2 = await unlikeComment(marsComment.id, luna);
            expect(res2, 'to exhaustively satisfy', apiErrorExpectation(403, "You can't un-like comment that you haven't yet liked"));
          });

          describe('comment likes sorting', () => {
            let pluto;

            beforeEach(async () => {
              pluto = await createUserAsync('pluto', 'pw');
            });

            it('should sort comment likes chronologically descending', async () => {
              const lunaComment = await writeComment(luna, lunaPost.id, 'Luna comment');
              await likeComment(lunaComment.id, mars);
              await likeComment(lunaComment.id, jupiter);
              await likeComment(lunaComment.id, pluto);
              const res = await unlikeComment(lunaComment.id, pluto);

              expect(res, 'to satisfy', { status: 200 });
              const responseJson = await res.json();

              expect(responseJson, 'to satisfy', {
                likes: expect.it('to be an array').and('to be non-empty').and('to have length', 2),
                users: expect.it('to be an array').and('to have items satisfying', schema.user)
              });

              expect(responseJson.likes[0].userId, 'to be', jupiter.user.id);
              expect(responseJson.likes[1].userId, 'to be', mars.user.id);
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

            it("should not allow Luna to unlike Mars' comment to Mars' post", async () => {
              const marsComment = await writeComment(mars, marsPost.id, 'Mars comment');
              const res = await unlikeComment(marsComment.id, luna);
              expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You can not see this post'));
            });

            it("should not allow Luna to unlike Pluto's comment to Pluto's post", async () => {
              const plutoComment = await writeComment(pluto, plutoPost.id, 'Pluto comment');
              const res = await unlikeComment(plutoComment.id, luna);
              expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You can not see this post'));
            });

            it("should not allow Luna to unlike Pluto's comment to Mars' post", async () => {
              const plutoComment = await writeComment(pluto, marsPost.id, 'Pluto comment');
              const res = await unlikeComment(plutoComment.id, luna);
              expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You can not see this post'));
            });

            it("should not allow Mars to unlike Luna's comment to Luna's post", async () => {
              const lunaComment = await writeComment(luna, lunaPost.id, 'Luna comment');
              await likeComment(lunaComment.id, mars);
              const res = await unlikeComment(lunaComment.id, mars);
              expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You can not see this post'));
            });

            it("should not allow Pluto to unlike Luna's comment to Luna's post", async () => {
              const lunaComment = await writeComment(luna, lunaPost.id, 'Luna comment');
              await likeComment(lunaComment.id, pluto);
              const res = await unlikeComment(lunaComment.id, pluto);
              expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You can not see this post'));
            });

            it("should not allow Pluto to unlike Jupiter's comment to Luna's post", async () => {
              const jupiterComment = await writeComment(jupiter, lunaPost.id, 'Jupiter comment');
              await likeComment(jupiterComment.id, pluto);
              const res = await unlikeComment(jupiterComment.id, pluto);
              expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You can not see this post'));
            });

            it('should not display Luna comment likes of Pluto and Mars', async () => {
              const jupiterPost = await createAndReturnPost(jupiter, 'Jupiter post');
              const jupiterComment = await writeComment(jupiter, jupiterPost.id, 'Jupiter comment');
              await likeComment(jupiterComment.id, pluto);
              await likeComment(jupiterComment.id, mars);
              await likeComment(jupiterComment.id, luna);
              const res = await unlikeComment(jupiterComment.id, luna);
              expect(res, 'to satisfy', commentHavingNoLikesExpectation);
            });

            describe('when Luna bans Jupiter after liking his comment', () => {
              it("should not allow Luna to unlike Jupiter's comment to Jupiter's post", async () => {
                const jupiterPost = await createAndReturnPost(jupiter, 'Jupiter post');
                const jupiterComment = await writeComment(jupiter, jupiterPost.id, 'Jupiter comment');
                await likeComment(jupiterComment.id, luna);

                await banUser(luna, jupiter);

                const res = await unlikeComment(jupiterComment.id, luna);
                expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You can not see this post'));
              });
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

            it('should allow any user to unlike comment in a public group', async () => {
              const marsComment = await writeComment(mars, dubhePost.id, 'Mars comment');
              await likeComment(marsComment.id, jupiter);
              const res = await unlikeComment(marsComment.id, jupiter);
              expect(res, 'to satisfy', commentHavingNoLikesExpectation);
            });

            it('should allow any user to unlike comment in a public restricted group', async () => {
              const marsComment = await writeComment(mars, merakPost.id, 'Mars comment');
              await likeComment(marsComment.id, jupiter);
              const res = await unlikeComment(marsComment.id, jupiter);
              expect(res, 'to satisfy', commentHavingNoLikesExpectation);
            });

            it('should allow members to unlike comment in a private group', async () => {
              const marsComment = await writeComment(mars, phadPost.id, 'Mars comment');
              await likeComment(marsComment.id, luna);
              const res = await unlikeComment(marsComment.id, luna);
              expect(res, 'to satisfy', commentHavingNoLikesExpectation);
            });

            it('should not allow non-members to unlike comment in a private group', async () => {
              const marsComment = await writeComment(mars, phadPost.id, 'Mars comment');
              const res = await unlikeComment(marsComment.id, jupiter);
              expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You can not see this post'));
            });

            it('should allow members to unlike comment in a private restricted group', async () => {
              const marsComment = await writeComment(mars, alkaidPost.id, 'Mars comment');
              await likeComment(marsComment.id, luna);
              const res = await unlikeComment(marsComment.id, luna);
              expect(res, 'to satisfy', commentHavingNoLikesExpectation);
            });

            it('should not allow non-members to unlike comment in a private restricted group', async () => {
              const marsComment = await writeComment(mars, alkaidPost.id, 'Mars comment');
              const res = await unlikeComment(marsComment.id, jupiter);
              expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You can not see this post'));
            });
          });
        });
      });
    });

    describe('#likes', () => {
      let luna, mars, jupiter;
      let lunaPost, marsPost;
      let marsComment, lunaComment;

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
        marsComment = await writeComment(mars, lunaPost.id, 'Mars comment');
        lunaComment = await writeComment(luna, marsPost.id, 'Luna comment');
        await likeComment(marsComment.id, luna);
      });

      it('should not allow to show likes of nonexisting comment', async () => {
        const res = await getCommentLikes(uuidv4(), luna);
        expect(res, 'to exhaustively satisfy', apiErrorExpectation(404, "Can't find comment"));
      });

      describe('for unauthenticated users', () => {
        it('should display comment likes for public post', async () => {
          const res = await getCommentLikes(marsComment.id);
          expect(res, 'to satisfy', commentHavingOneLikeExpectation(luna));
        });

        it("should display no comment likes for public post's comment that has no likes", async () => {
          const res = await getCommentLikes(lunaComment.id);
          expect(res, 'to satisfy', commentHavingNoLikesExpectation);
        });

        it('should not display comment likes for protected post', async () => {
          await updateUserAsync(luna, { isProtected: '1' });
          const res = await getCommentLikes(marsComment.id);
          expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'Please sign in to view this post'));
        });

        it('should not display comment likes for private post', async () => {
          await updateUserAsync(luna, { isProtected: '0', isPrivate: '1' });
          const res = await getCommentLikes(marsComment.id);
          expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You can not see this post'));
        });
      });

      describe('for authenticated users', () => {
        it('should display comment likes for public post', async () => {
          const res = await getCommentLikes(marsComment.id, luna);
          expect(res, 'to satisfy', commentHavingOneLikeExpectation(luna));
        });

        it("should display no comment likes for public post's comment that has no likes", async () => {
          const res = await getCommentLikes(lunaComment.id, luna);
          expect(res, 'to satisfy', commentHavingNoLikesExpectation);
        });

        it('should display comment likes for protected post for all users', async () => {
          await updateUserAsync(luna, { isProtected: '1' });
          let res = await getCommentLikes(marsComment.id, luna);
          expect(res, 'to satisfy', commentHavingOneLikeExpectation(luna));
          res = await getCommentLikes(marsComment.id, mars);
          expect(res, 'to satisfy', commentHavingOneLikeExpectation(luna));
          res = await getCommentLikes(marsComment.id, jupiter);
          expect(res, 'to satisfy', commentHavingOneLikeExpectation(luna));
        });

        it('should display comment likes to subscribers of private user', async () => {
          await updateUserAsync(luna, { isProtected: '0', isPrivate: '1' });
          let res = await getCommentLikes(marsComment.id, luna);
          expect(res, 'to satisfy', commentHavingOneLikeExpectation(luna));
          res = await getCommentLikes(marsComment.id, mars);
          expect(res, 'to satisfy', commentHavingOneLikeExpectation(luna));
        });

        it('should not display comment likes to non-subscribers of private user', async () => {
          await updateUserAsync(luna, { isProtected: '0', isPrivate: '1' });
          const res = await getCommentLikes(marsComment.id, jupiter);
          expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You can not see this post'));
        });
      });

      describe('comment likes sorting', () => {
        let pluto;

        beforeEach(async () => {
          pluto = await createUserAsync('pluto', 'pw');
          await likeComment(marsComment.id, jupiter);
          await likeComment(marsComment.id, pluto);
        });

        it('should sort comment likes chronologically descending (except viewer)', async () => {
          const res = await getCommentLikes(marsComment.id, luna);
          expect(res, 'to satisfy', { status: 200 });
          const responseJson = await res.json();

          expect(responseJson, 'to satisfy', {
            likes: expect.it('to be an array').and('to be non-empty').and('to have length', 3),
            users: expect.it('to be an array').and('to have items satisfying', schema.user)
          });

          expect(responseJson.likes[0].userId, 'to be', luna.user.id);
          expect(responseJson.likes[1].userId, 'to be', pluto.user.id);
          expect(responseJson.likes[2].userId, 'to be', jupiter.user.id);
        });

        it('should sort comment likes chronologically descending for authenticated viewer', async () => {
          const res = await getCommentLikes(marsComment.id, mars);
          expect(res, 'to satisfy', { status: 200 });
          const responseJson = await res.json();

          expect(responseJson, 'to satisfy', {
            likes: expect.it('to be an array').and('to be non-empty').and('to have length', 3),
            users: expect.it('to be an array').and('to have items satisfying', schema.user)
          });

          expect(responseJson.likes[0].userId, 'to be', pluto.user.id);
          expect(responseJson.likes[1].userId, 'to be', jupiter.user.id);
          expect(responseJson.likes[2].userId, 'to be', luna.user.id);
        });

        it('should sort comment likes chronologically descending for anonymous viewer', async () => {
          const res = await getCommentLikes(marsComment.id);
          expect(res, 'to satisfy', { status: 200 });
          const responseJson = await res.json();

          expect(responseJson, 'to satisfy', {
            likes: expect.it('to be an array').and('to be non-empty').and('to have length', 3),
            users: expect.it('to be an array').and('to have items satisfying', schema.user)
          });

          expect(responseJson.likes[0].userId, 'to be', pluto.user.id);
          expect(responseJson.likes[1].userId, 'to be', jupiter.user.id);
          expect(responseJson.likes[2].userId, 'to be', luna.user.id);
        });
      });

      describe('when Luna bans Mars and stranger Pluto', () => {
        let pluto, plutoPost, plutoComment, jupiterComment;

        beforeEach(async () => {
          pluto = await createUserAsync('pluto', 'pw');
          plutoPost = await createAndReturnPost(pluto, 'Pluto post');
          plutoComment = await writeComment(pluto, plutoPost.id, 'Pluto comment');
          jupiterComment = await writeComment(jupiter, plutoPost.id, 'Jupiter comment');
          await likeComment(plutoComment.id, jupiter);
          await likeComment(jupiterComment.id, pluto);
          await Promise.all([
            banUser(luna, mars),
            banUser(luna, pluto)
          ]);
        });

        it("should not show Luna Mars' comment likes", async () => {
          const res = await getCommentLikes(marsComment.id, luna);
          expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You have banned by the author of this comment'));
        });

        it("should not show Luna Pluto's comment likes", async () => {
          const res = await getCommentLikes(plutoComment.id, luna);
          expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You can not see this post'));
        });

        it("should not show Luna Pluto's likes to Jupiter's comment", async () => {
          const res = await getCommentLikes(jupiterComment.id, luna);
          expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You can not see this post'));
        });

        it("should show Mars Luna's comment likes", async () => {
          const res = await getCommentLikes(marsComment.id, mars);
          expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You can not see this post'));
        });

        it("should show Pluto Luna's comment likes", async () => {
          const res = await getCommentLikes(marsComment.id, pluto);
          expect(res, 'to exhaustively satisfy', apiErrorExpectation(403, 'You can not see this post'));
        });

        it("should show Pluto Jupiter's comment likes", async () => {
          const res = await getCommentLikes(plutoComment.id, pluto);
          expect(res, 'to satisfy', commentHavingOneLikeExpectation(jupiter));
        });

        it('should not display Luna comment likes of Pluto and Mars', async () => {
          const jupiterPost = await createAndReturnPost(jupiter, 'Jupiter post');
          const jupiterComment2 = await writeComment(jupiter, jupiterPost.id, 'Jupiter comment');

          await likeComment(jupiterComment2.id, pluto);
          await likeComment(jupiterComment2.id, mars);
          await likeComment(jupiterComment2.id, luna);

          let res = await getCommentLikes(jupiterComment2.id, luna);
          expect(res, 'to satisfy', commentHavingOneLikeExpectation(luna));

          res = await getCommentLikes(jupiterComment2.id, pluto);
          const responseJson = await res.json();

          expect(responseJson, 'to satisfy', {
            likes: expect.it('to be an array').and('to be non-empty').and('to have length', 3),
            users: expect.it('to be an array').and('to have items satisfying', schema.user)
          });

          expect(responseJson.likes[0].userId, 'to be', pluto.user.id);
          expect(responseJson.likes[1].userId, 'to be', luna.user.id);
          expect(responseJson.likes[2].userId, 'to be', mars.user.id);
        });
      });
    });
  });

  describe('PostsControllerV2', () => {
    describe('comment likes fields', () => {
      let luna, mars, jupiter, pluto;
      let lunaPost;

      const expectCommentLikesCountToBe = async (postId, viewer = null, all, own, omitted, omittedOwn, allComments = false) => {
        const res = await getPost(postId, viewer, allComments);

        expect(res, 'to satisfy', { status: 200 });
        const responseJson = await res.json();

        expect(responseJson, 'to satisfy', {
          posts: {
            commentLikes:           all,
            ownCommentLikes:        own,
            omittedCommentLikes:    omitted,
            omittedOwnCommentLikes: omittedOwn
          }
        });
      };

      beforeEach(async () => {
        [luna, mars, jupiter, pluto] = await Promise.all([
          createUserAsync('luna', 'pw'),
          createUserAsync('mars', 'pw'),
          createUserAsync('jupiter', 'pw'),
          createUserAsync('pluto', 'pw'),
        ]);
        lunaPost = await createAndReturnPost(luna, 'Luna post');
        await mutualSubscriptions([luna, mars]);
      });

      describe('should be zeroes for post without comments', () => {
        it('for anonymous user', async () => {
          await expectCommentLikesCountToBe(lunaPost.id, null, 0, 0, 0, 0);
          await expectCommentLikesCountToBe(lunaPost.id, null, 0, 0, 0, 0, true);
        });

        it('for post author', async () => {
          await expectCommentLikesCountToBe(lunaPost.id, luna, 0, 0, 0, 0);
          await expectCommentLikesCountToBe(lunaPost.id, luna, 0, 0, 0, 0, true);
        });

        it('for any user', async () => {
          await expectCommentLikesCountToBe(lunaPost.id, mars, 0, 0, 0, 0);
          await expectCommentLikesCountToBe(lunaPost.id, jupiter, 0, 0, 0, 0, true);
        });
      });

      describe('should contain actual comment likes count for post with', () => {
        describe('1 comment', () => {
          beforeEach(async () => {
            const comment = await writeComment(jupiter, lunaPost.id, 'Jupiter comment');
            await likeComment(comment.id, pluto);
            await likeComment(comment.id, mars);
            await likeComment(comment.id, luna);
          });

          it('for anonymous user', async () => await expectCommentLikesCountToBe(lunaPost.id, null, 3, 0, 0, 0));
          it('for comment liker', async () => await expectCommentLikesCountToBe(lunaPost.id, luna, 3, 1, 0, 0));
          it('for comment author', async () => await expectCommentLikesCountToBe(lunaPost.id, jupiter, 3, 0, 0, 0));
        });

        describe('2 comments', () => {
          beforeEach(async () => {
            const comment1 = await writeComment(jupiter, lunaPost.id, 'Jupiter comment');
            const comment2 = await writeComment(luna, lunaPost.id, 'Luna comment');
            await likeComment(comment1.id, pluto);
            await likeComment(comment1.id, mars);
            await likeComment(comment1.id, luna);
            await likeComment(comment2.id, pluto);
            await likeComment(comment2.id, mars);
          });

          it('for anonymous user', async () => await expectCommentLikesCountToBe(lunaPost.id, null, 5, 0, 0, 0));
          it('for comment liker', async () => await expectCommentLikesCountToBe(lunaPost.id, luna, 5, 1, 0, 0));
          it('for other comment liker', async () => await expectCommentLikesCountToBe(lunaPost.id, pluto, 5, 2, 0, 0));
          it('for comment author', async () => await expectCommentLikesCountToBe(lunaPost.id, jupiter, 5, 0, 0, 0));
        });

        describe('3 comments', () => {
          beforeEach(async () => {
            const comment1 = await writeComment(jupiter, lunaPost.id, 'Jupiter comment');
            await writeComment(luna, lunaPost.id, 'Luna comment');
            const comment3 = await writeComment(mars, lunaPost.id, 'Mars comment');
            await likeComment(comment1.id, pluto);
            await likeComment(comment1.id, mars);
            await likeComment(comment1.id, luna);
            await likeComment(comment3.id, pluto);
            await likeComment(comment3.id, luna);
          });

          it('for anonymous user', async () => await expectCommentLikesCountToBe(lunaPost.id, null, 5, 0, 0, 0));
          it('for comment liker', async () => await expectCommentLikesCountToBe(lunaPost.id, luna, 5, 2, 0, 0));
          it('for other comment liker', async () => await expectCommentLikesCountToBe(lunaPost.id, pluto, 5, 2, 0, 0));
          it('for comment author', async () => await expectCommentLikesCountToBe(lunaPost.id, jupiter, 5, 0, 0, 0));
          it('for other comment author', async () => await expectCommentLikesCountToBe(lunaPost.id, mars, 5, 1, 0, 0));
        });

        describe('4 comments', () => {
          beforeEach(async () => {
            const comment1 = await writeComment(jupiter, lunaPost.id, 'Jupiter comment');
            const comment2 = await writeComment(luna, lunaPost.id, 'Luna comment');
            const comment3 = await writeComment(mars, lunaPost.id, 'Mars comment');
            const comment4 = await writeComment(mars, lunaPost.id, 'Mars comment');
            await likeComment(comment1.id, pluto);
            await likeComment(comment2.id, mars);
            await likeComment(comment3.id, jupiter);
            await likeComment(comment4.id, luna);
          });

          describe('with comment folding', () => {
            it('for anonymous user',  async () => await expectCommentLikesCountToBe(lunaPost.id, null, 4, 0, 2, 0));
            it('for Pluto',           async () => await expectCommentLikesCountToBe(lunaPost.id, pluto, 4, 1, 2, 0));
            it('for Mars',            async () => await expectCommentLikesCountToBe(lunaPost.id, mars, 4, 1, 2, 1));
            it('for Jupiter',         async () => await expectCommentLikesCountToBe(lunaPost.id, jupiter, 4, 1, 2, 1));
            it('for Luna',            async () => await expectCommentLikesCountToBe(lunaPost.id, luna, 4, 1, 2, 0));
          });

          describe('without comment folding', () => {
            it('for anonymous user',  async () => await expectCommentLikesCountToBe(lunaPost.id, null, 4, 0, 0, 0, true));
            it('for Pluto',           async () => await expectCommentLikesCountToBe(lunaPost.id, pluto, 4, 1, 0, 0, true));
            it('for Mars',            async () => await expectCommentLikesCountToBe(lunaPost.id, mars, 4, 1, 0, 0, true));
            it('for Jupiter',         async () => await expectCommentLikesCountToBe(lunaPost.id, jupiter, 4, 1, 0, 0, true));
            it('for Luna',            async () => await expectCommentLikesCountToBe(lunaPost.id, luna, 4, 1, 0, 0, true));
          });
        });

        describe('5 comments', () => {
          beforeEach(async () => {
            const comment1 = await writeComment(jupiter, lunaPost.id, 'Jupiter comment');
            const comment2 = await writeComment(luna, lunaPost.id, 'Luna comment');
            const comment3 = await writeComment(mars, lunaPost.id, 'Mars comment');
            await writeComment(mars, lunaPost.id, 'Mars comment');
            const comment5 = await writeComment(pluto, lunaPost.id, 'Pluto comment');
            await likeComment(comment1.id, pluto);
            await likeComment(comment2.id, mars);
            await likeComment(comment3.id, jupiter);
            await likeComment(comment5.id, luna);
          });

          describe('with comment folding', () => {
            it('for anonymous user',  async () => await expectCommentLikesCountToBe(lunaPost.id, null, 4, 0, 2, 0));
            it('for Pluto',           async () => await expectCommentLikesCountToBe(lunaPost.id, pluto, 4, 1, 2, 0));
            it('for Mars',            async () => await expectCommentLikesCountToBe(lunaPost.id, mars, 4, 1, 2, 1));
            it('for Jupiter',         async () => await expectCommentLikesCountToBe(lunaPost.id, jupiter, 4, 1, 2, 1));
            it('for Luna',            async () => await expectCommentLikesCountToBe(lunaPost.id, luna, 4, 1, 2, 0));
          });

          describe('without comment folding', () => {
            it('for anonymous user',  async () => await expectCommentLikesCountToBe(lunaPost.id, null, 4, 0, 0, 0, true));
            it('for Pluto',           async () => await expectCommentLikesCountToBe(lunaPost.id, pluto, 4, 1, 0, 0, true));
            it('for Mars',            async () => await expectCommentLikesCountToBe(lunaPost.id, mars, 4, 1, 0, 0, true));
            it('for Jupiter',         async () => await expectCommentLikesCountToBe(lunaPost.id, jupiter, 4, 1, 0, 0, true));
            it('for Luna',            async () => await expectCommentLikesCountToBe(lunaPost.id, luna, 4, 1, 0, 0, true));
          });
        });
      });

      describe("should exclude banned user's comment likes", () => {
        beforeEach(async () => {
          const comment1 = await writeComment(jupiter, lunaPost.id, 'Jupiter comment');
          const comment2 = await writeComment(luna, lunaPost.id, 'Luna comment');
          const comment3 = await writeComment(mars, lunaPost.id, 'Mars comment');
          await writeComment(mars, lunaPost.id, 'Mars comment');
          const comment5 = await writeComment(pluto, lunaPost.id, 'Pluto comment');
          await likeComment(comment1.id, pluto);
          await likeComment(comment2.id, mars);
          await likeComment(comment3.id, jupiter);
          await likeComment(comment5.id, luna);

          await Promise.all([
            banUser(luna, jupiter),
            banUser(luna, pluto)
          ]);
        });

        describe('with comment folding', () => {
          it('for anonymous user',  async () => await expectCommentLikesCountToBe(lunaPost.id, null, 4, 0, 2, 0));
          it('for Mars',            async () => await expectCommentLikesCountToBe(lunaPost.id, mars, 4, 1, 2, 1));
          it('for Luna',            async () => await expectCommentLikesCountToBe(lunaPost.id, luna, 1, 0, 0, 0));
        });

        describe('without comment folding', () => {
          it('for anonymous user',  async () => await expectCommentLikesCountToBe(lunaPost.id, null, 4, 0, 0, 0, true));
          it('for Mars',            async () => await expectCommentLikesCountToBe(lunaPost.id, mars, 4, 1, 0, 0, true));
          it('for Luna',            async () => await expectCommentLikesCountToBe(lunaPost.id, luna, 1, 0, 0, 0, true));
        });
      });

      describe('should be present in comment payload', () => {
        beforeEach(async () => {
          const comment = await writeComment(jupiter, lunaPost.id, 'Jupiter comment');
          await likeComment(comment.id, pluto);
          await likeComment(comment.id, mars);
          await likeComment(comment.id, luna);
        });

        it('for anonymous user', async () => {
          const res = await getPost(lunaPost.id);

          expect(res, 'to satisfy', { status: 200 });
          const responseJson = await res.json();

          expect(responseJson, 'to satisfy', {
            comments: expect
              .it('to be an array')
              .and('to be non-empty')
              .and('to have length', 1)
              .and('to have items satisfying', {
                likes:      3,
                hasOwnLike: false
              })
          });
        });

        it('for Luna', async () => {
          const res = await getPost(lunaPost.id, luna);

          expect(res, 'to satisfy', { status: 200 });
          const responseJson = await res.json();

          expect(responseJson, 'to satisfy', {
            comments: expect
              .it('to be an array')
              .and('to be non-empty')
              .and('to have length', 1)
              .and('to have items satisfying', {
                likes:      3,
                hasOwnLike: true
              })
          });
        });

        it('for Mars', async () => {
          const res = await getPost(lunaPost.id, mars);

          expect(res, 'to satisfy', { status: 200 });
          const responseJson = await res.json();

          expect(responseJson, 'to satisfy', {
            comments: expect
              .it('to be an array')
              .and('to be non-empty')
              .and('to have length', 1)
              .and('to have items satisfying', {
                likes:      3,
                hasOwnLike: true
              })
          });
        });

        it('for Pluto', async () => {
          const res = await getPost(lunaPost.id, pluto);

          expect(res, 'to satisfy', { status: 200 });
          const responseJson = await res.json();

          expect(responseJson, 'to satisfy', {
            comments: expect
              .it('to be an array')
              .and('to be non-empty')
              .and('to have length', 1)
              .and('to have items satisfying', {
                likes:      3,
                hasOwnLike: true
              })
          });
        });

        it('for Jupiter', async () => {
          const res = await getPost(lunaPost.id, jupiter);

          expect(res, 'to satisfy', { status: 200 });
          const responseJson = await res.json();

          expect(responseJson, 'to satisfy', {
            comments: expect
              .it('to be an array')
              .and('to be non-empty')
              .and('to have length', 1)
              .and('to have items satisfying', {
                likes:      3,
                hasOwnLike: false
              })
          });
        });
      });
    });
  });

  describe('TimelinesControllerV2', () => {
    let luna, mars, jupiter, pluto;
    let lunaPost, comment;

    const expectFeedCommentLikesCountsToBe = async (feedName, viewer, all, own, omitted, omittedOwn) => {
      const response = await getFeed(feedName, viewer);
      const responseJson = await response.json();
      expect(responseJson, 'to satisfy', {
        posts: [{
          commentLikes:           all,
          ownCommentLikes:        own,
          omittedCommentLikes:    omitted,
          omittedOwnCommentLikes: omittedOwn
        }]
      });
    };

    beforeEach(async () => {
      [luna, mars, jupiter, pluto] = await Promise.all([
        createUserAsync('luna', 'pw'),
        createUserAsync('mars', 'pw'),
        createUserAsync('jupiter', 'pw'),
        createUserAsync('pluto', 'pw'),
      ]);
      lunaPost = await createAndReturnPost(luna, 'Luna post');
      await mutualSubscriptions([luna, mars]);

      comment = await writeComment(jupiter, lunaPost.id, 'Jupiter comment');
      await likeComment(comment.id, pluto);
      await likeComment(comment.id, mars);
    });

    describe('comment likes fields should be present', () => {
      it("at Luna's home feed", async () => await expectFeedCommentLikesCountsToBe('home', luna, 2, 0, 0, 0));
      it("at Mars's home feed", async () => await expectFeedCommentLikesCountsToBe('home', mars, 2, 1, 0, 0));
      it("at Luna's discussions feed", async () => await expectFeedCommentLikesCountsToBe('filter/discussions?with-my-posts=yes', luna, 2, 0, 0, 0));

      it("at Mars' directs feed", async () => {
        const luna2marsDirectPost = await createAndReturnPost({ username: 'mars', authToken: luna.authToken }, 'Luna direct');
        const directComment = await writeComment(mars, luna2marsDirectPost.id, 'Mars direct comment');
        await likeComment(directComment.id, luna);
        await expectFeedCommentLikesCountsToBe('filter/directs', mars, 1, 0, 0, 0);
      });
      it("at Luna's posts feed", async () => await expectFeedCommentLikesCountsToBe('luna', luna, 2, 0, 0, 0));
      it("at Jupiter's comments feed", async () => await expectFeedCommentLikesCountsToBe('jupiter/comments', jupiter, 2, 0, 0, 0));
    });

    describe('for post with folded comments', () => {
      describe('comments likes fields should contain correct counts', () => {
        let comment2, comment3, comment4, comment5;
        beforeEach(async () => {
          comment2 = await writeComment(mars, lunaPost.id, 'Mars comment');
          comment3 = await writeComment(pluto, lunaPost.id, 'Pluto comment');
          comment4 = await writeComment(luna, lunaPost.id, 'Luna comment');
          comment5 = await writeComment(jupiter, lunaPost.id, 'Jupiter comment');
        });
        it('when only first comment is liked', async () => await expectFeedCommentLikesCountsToBe('home', luna, 2, 0, 0, 0));

        it('when one of folded comments is liked', async () => {
          await likeComment(comment2.id, pluto);
          await expectFeedCommentLikesCountsToBe('home', luna, 3, 0, 1, 0);
        });

        it('when one of folded comments is liked', async () => {
          await likeComment(comment3.id, mars);
          await expectFeedCommentLikesCountsToBe('home', luna, 3, 0, 1, 0);
        });

        it('when one of folded comments is liked', async () => {
          await likeComment(comment4.id, pluto);
          await expectFeedCommentLikesCountsToBe('home', luna, 3, 0, 1, 0);
        });

        it('when first and last comments are liked', async () => {
          await likeComment(comment5.id, pluto);
          await expectFeedCommentLikesCountsToBe('home', luna, 3, 0, 0, 0);
        });

        it('when first comment is liked by viewer', async () => {
          await likeComment(comment.id, luna);
          await expectFeedCommentLikesCountsToBe('home', luna, 3, 1, 0, 0);
        });

        it('when one of folded comments is liked by viewer', async () => {
          await likeComment(comment2.id, luna);
          await expectFeedCommentLikesCountsToBe('home', luna, 3, 1, 1, 1);
          await likeComment(comment3.id, luna);
          await expectFeedCommentLikesCountsToBe('home', luna, 4, 2, 2, 2);
          await likeComment(comment4.id, pluto);
          await expectFeedCommentLikesCountsToBe('home', luna, 5, 2, 3, 2);
        });

        it('when one of comment likers is banned by viewer', async () => {
          await likeComment(comment2.id, luna);
          await likeComment(comment3.id, luna);
          await likeComment(comment4.id, pluto);
          await expectFeedCommentLikesCountsToBe('home', luna, 5, 2, 3, 2);

          await banUser(luna, mars);

          await expectFeedCommentLikesCountsToBe('home', luna, 3, 1, 2, 1);
          await expectFeedCommentLikesCountsToBe('home', jupiter, 5, 0, 3, 0);
        });

        describe(`when viewer disabled 'hide comments from banned users' option`, () => {
          beforeEach(async () => {
            await updateUserAsync(luna, { preferences: { hideCommentsOfTypes: [] } });
          });

          it(`and first (and liked) comment's author is banned by viewer [negative OmittedCommentLikes]`, async () => {
            await banUser(luna, jupiter);
            await expectFeedCommentLikesCountsToBe('home', luna, 0, 0, 0, 0);
          });

          it(`and first (and liked by viewer) comment's author is banned by viewer [negative OmittedCommentLikes]`, async () => {
            await likeComment(comment.id, luna);
            await banUser(luna, jupiter);
            await expectFeedCommentLikesCountsToBe('home', luna, 0, 0, 0, 0);
          });

          it(`and folded (and liked) comment's author is banned by viewer [negative OmittedCommentLikes]`, async () => {
            await likeComment(comment3.id, mars);
            await likeComment(comment3.id, jupiter);
            await banUser(luna, pluto);
            await expectFeedCommentLikesCountsToBe('home', luna, 1, 0, 0, 0);
          });

          it(`and last (and liked) comment's author is banned by viewer [negative OmittedCommentLikes]`, async () => {
            const comment6 = await writeComment(pluto, lunaPost.id, 'Pluto comment 2');
            await likeComment(comment6.id, mars);
            await likeComment(comment6.id, jupiter);
            await banUser(luna, pluto);
            await expectFeedCommentLikesCountsToBe('home', luna, 1, 0, 0, 0);
          });
        });
      });
    });

    describe('#bestOf', () => {
      beforeEach(async () => {
        const neptune = await createUserAsync('neptune', 'pw');

        await Promise.all([
          writeComment(jupiter, lunaPost.id, 'Jupiter comment2'),
          writeComment(jupiter, lunaPost.id, 'Jupiter comment3'),
          writeComment(pluto, lunaPost.id, 'Pluto comment1'),
          writeComment(pluto, lunaPost.id, 'Pluto comment2'),
          writeComment(pluto, lunaPost.id, 'Pluto comment3'),
          writeComment(mars, lunaPost.id, 'Mars comment1'),
          writeComment(mars, lunaPost.id, 'Mars comment2'),
          writeComment(mars, lunaPost.id, 'Mars comment3'),
          writeComment(luna, lunaPost.id, 'Luna comment1'),
          writeComment(luna, lunaPost.id, 'Luna comment2'),
          writeComment(luna, lunaPost.id, 'Luna comment3'),
          writeComment(neptune, lunaPost.id, 'Neptune comment1'),
          writeComment(neptune, lunaPost.id, 'Neptune comment2'),
          writeComment(neptune, lunaPost.id, 'Neptune comment3'),
        ]);

        const promises = [];

        for (let n = 0; n < 6; n++) {
          promises.push(createUserAsync(`username${n + 1}`, 'pw'));
        }

        const users = await Promise.all(promises);
        users.push(...[jupiter, pluto, mars, neptune]);
        await Promise.all(users.map((u) => like(lunaPost.id, u.authToken)));
      });

      it('comment likes fields should be present and contain correct counts', async () => {
        const headers = { 'X-Authentication-Token': luna.authToken };
        const response = await fetch(`${app.context.config.host}/v2/bestof`, { headers });
        const responseJson = await response.json();
        expect(responseJson, 'to satisfy', {
          posts: [{
            commentLikes:           2,
            ownCommentLikes:        0,
            omittedCommentLikes:    0,
            omittedOwnCommentLikes: 0
          }]
        });
      });
    });
  });

  describe('SearchController', () => {
    let luna, mars, jupiter, pluto;
    let lunaPost, comment;

    const expectSearchResultsCommentLikesCountsToBe = async (query, viewer, all, own, omitted, omittedOwn) => {
      const responseJson = await performSearch(viewer, query);
      expect(responseJson, 'to satisfy', {
        posts: [{
          commentLikes:           all,
          ownCommentLikes:        own,
          omittedCommentLikes:    omitted,
          omittedOwnCommentLikes: omittedOwn
        }]
      });
    };

    beforeEach(async () => {
      [luna, mars, jupiter, pluto] = await Promise.all([
        createUserAsync('luna', 'pw'),
        createUserAsync('mars', 'pw'),
        createUserAsync('jupiter', 'pw'),
        createUserAsync('pluto', 'pw'),
      ]);
      lunaPost = await createAndReturnPost(luna, 'Luna post cliked');
      await mutualSubscriptions([luna, mars]);

      comment = await writeComment(jupiter, lunaPost.id, 'Jupiter comment');
      await likeComment(comment.id, pluto);
      await likeComment(comment.id, mars);
    });

    describe('comment likes fields should be present', () => {
      it('at search results for Luna', async () => await expectSearchResultsCommentLikesCountsToBe('cliked', luna, 2, 0, 0, 0));
      it('at search results for Mars', async () => await expectSearchResultsCommentLikesCountsToBe('cliked', mars, 2, 1, 0, 0));
      it('at search results for Jupiter', async () => await expectSearchResultsCommentLikesCountsToBe('cliked', jupiter, 2, 0, 0, 0));
    });

    describe('at search results containing post with folded comments', () => {
      describe('comments likes fields should contain correct counts', () => {
        let comment2, comment3, comment4, comment5;
        beforeEach(async () => {
          comment2 = await writeComment(mars, lunaPost.id, 'Mars comment');
          comment3 = await writeComment(pluto, lunaPost.id, 'Pluto comment');
          comment4 = await writeComment(luna, lunaPost.id, 'Luna comment');
          comment5 = await writeComment(jupiter, lunaPost.id, 'Jupiter comment');
        });
        it('when only first comment is liked', async () => await expectSearchResultsCommentLikesCountsToBe('cliked', luna, 2, 0, 0, 0));

        it('when one of folded comments is liked', async () => {
          await likeComment(comment2.id, pluto);
          await expectSearchResultsCommentLikesCountsToBe('cliked', luna, 3, 0, 1, 0);
        });

        it('when one of folded comments is liked', async () => {
          await likeComment(comment3.id, mars);
          await expectSearchResultsCommentLikesCountsToBe('cliked', luna, 3, 0, 1, 0);
        });

        it('when one of folded comments is liked', async () => {
          await likeComment(comment4.id, pluto);
          await expectSearchResultsCommentLikesCountsToBe('cliked', luna, 3, 0, 1, 0);
        });

        it('when first and last comments are liked', async () => {
          await likeComment(comment5.id, pluto);
          await expectSearchResultsCommentLikesCountsToBe('cliked', luna, 3, 0, 0, 0);
        });

        it('when first comment is liked by viewer', async () => {
          await likeComment(comment.id, luna);
          await expectSearchResultsCommentLikesCountsToBe('cliked', luna, 3, 1, 0, 0);
        });

        it('when one of folded comments is liked by viewer', async () => {
          await likeComment(comment2.id, luna);
          await expectSearchResultsCommentLikesCountsToBe('cliked', luna, 3, 1, 1, 1);
          await likeComment(comment3.id, luna);
          await expectSearchResultsCommentLikesCountsToBe('cliked', luna, 4, 2, 2, 2);
          await likeComment(comment4.id, pluto);
          await expectSearchResultsCommentLikesCountsToBe('cliked', luna, 5, 2, 3, 2);
        });

        it('when one of comment likers is banned by viewer', async () => {
          await likeComment(comment2.id, luna);
          await likeComment(comment3.id, luna);
          await likeComment(comment4.id, pluto);
          await expectSearchResultsCommentLikesCountsToBe('cliked', luna, 5, 2, 3, 2);

          await banUser(luna, mars);

          await expectSearchResultsCommentLikesCountsToBe('cliked', luna, 3, 1, 2, 1);
          await expectSearchResultsCommentLikesCountsToBe('cliked', jupiter, 5, 0, 3, 0);
        });

        describe(`when viewer disabled 'hide comments from banned users' option`, () => {
          beforeEach(async () => {
            await updateUserAsync(luna, { preferences: { hideCommentsOfTypes: [] } });
          });

          it(`and first (and liked) comment's author is banned by viewer [negative OmittedCommentLikes]`, async () => {
            await banUser(luna, jupiter);
            await expectSearchResultsCommentLikesCountsToBe('cliked', luna, 0, 0, 0, 0);
          });

          it(`and first (and liked by viewer) comment's author is banned by viewer [negative OmittedCommentLikes]`, async () => {
            await likeComment(comment.id, luna);
            await banUser(luna, jupiter);
            await expectSearchResultsCommentLikesCountsToBe('cliked', luna, 0, 0, 0, 0);
          });

          it(`and folded (and liked) comment's author is banned by viewer [negative OmittedCommentLikes]`, async () => {
            await likeComment(comment3.id, mars);
            await likeComment(comment3.id, jupiter);
            await banUser(luna, pluto);
            await expectSearchResultsCommentLikesCountsToBe('cliked', luna, 1, 0, 0, 0);
          });

          it(`and last (and liked) comment's author is banned by viewer [negative OmittedCommentLikes]`, async () => {
            const comment6 = await writeComment(pluto, lunaPost.id, 'Pluto comment 2');
            await likeComment(comment6.id, mars);
            await likeComment(comment6.id, jupiter);
            await banUser(luna, pluto);
            await expectSearchResultsCommentLikesCountsToBe('cliked', luna, 1, 0, 0, 0);
          });
        });
      });
    });
  });
});

const createComment = () => async (userContext, postId, body) => {
  const response = await createCommentAsync(userContext, postId, body);
  const commentData = await response.json();
  return commentData.comments;
};

const fetchPost = (app) => async (postId, viewerContext = null, allComments = false) => {
  const headers = {};

  if (viewerContext) {
    headers['X-Authentication-Token'] = viewerContext.authToken;
  }

  const response = await fetch(`${app.context.config.host}/v2/posts/${postId}?maxComments=${allComments ? 'all' : ''}`, { method: 'GET', headers });
  return response;
};

const fetchTimeline = (app) => async (path, viewerContext = null) => {
  const headers = {};

  if (viewerContext) {
    headers['X-Authentication-Token'] = viewerContext.authToken;
  }

  const response = await fetch(`${app.context.config.host}/v2/timelines/${path}`, { headers });
  return response;
};

const commentHavingOneLikeExpectation = (liker) => async (obj) => {
  expect(obj, 'to satisfy', { status: 200 });
  const responseJson = await obj.json();

  expect(responseJson, 'to satisfy', {
    likes: expect
      .it('to be an array')
      .and('to be non-empty')
      .and('to have length', 1)
      .and('to have items satisfying', {
        userId:    expect.it('to satisfy', schema.UUID).and('to be', liker.user.id),
        createdAt: expect.it('when passed as parameter to', validator.isISO8601, 'to be', true)
      }),
    users: expect.it('to be an array').and('to have items satisfying', schema.user)
  });
};

const commentHavingNoLikesExpectation = async (obj) => {
  expect(obj, 'to satisfy', { status: 200 });
  const responseJson = await obj.json();

  expect(responseJson, 'to satisfy', {
    likes: expect.it('to be an array').and('to be empty'),
    users: expect.it('to be an array').and('to be empty')
  });
};

const apiErrorExpectation = (code, message) => async (obj) => {
  expect(obj, 'to satisfy', { status: code });
  const responseJson = await obj.json();
  expect(responseJson, 'to satisfy', { err: message });
};
