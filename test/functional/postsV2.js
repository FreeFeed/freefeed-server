/* eslint-env node, mocha */
/* global $pg_database */
import fetch from 'node-fetch'
import expect from 'unexpected'

import cleanDB from '../dbCleaner'
import { getSingleton } from '../../app/app'
import { DummyPublisher } from '../../app/pubsub'
import { PubSub } from '../../app/models'

import {
  createUserAsync,
  createAndReturnPost,
  createCommentAsync,
  like,
  goPrivate,
  goProtected,
  mutualSubscriptions,
  fetchPost,
  createMockAttachmentAsync,
  updatePostAsync,
  hidePost,
} from './functional_test_helper'


describe('TimelinesControllerV2', () => {
  let app;
  let fetchPostOpenGraph;
  before(async () => {
    app = await getSingleton();
    fetchPostOpenGraph = postOpenGraphFetcher(app);
    PubSub.setPublisher(new DummyPublisher());
  });

  beforeEach(() => cleanDB($pg_database));

  describe('#postsV2', () => {
    describe('Luna wrote post, Mars is mutual friend, Venus is stranger', () => {
      let luna, mars, venus;
      let lunaPost;
      beforeEach(async () => {
        [luna, mars, venus] = await Promise.all([
          createUserAsync('luna', 'pw'),
          createUserAsync('mars', 'pw'),
          createUserAsync('venus', 'pw'),
        ]);
        lunaPost = await createAndReturnPost(luna, 'Luna post');
        await mutualSubscriptions([luna, mars]);
      });

      describe('Comments folding test', () => {
        const expectFolding = async (nComments, expComments, expOmitted, allComments = false) => {
          for (let n = 0; n < nComments; n++) {
            await createCommentAsync(luna, lunaPost.id, `Comment ${n + 1}`);  // eslint-disable-line no-await-in-loop
          }

          const post = await fetchPost(lunaPost.id, null, { allComments });
          expect(post.posts.comments, 'to have length', expComments);
          expect(post.posts.omittedComments, 'to equal', expOmitted);
        };

        describe('Folded comments', () => {
          it('should return post whith 1 comment without folding', async () => await expectFolding(1, 1, 0));
          it('should return post whith 2 comments without folding', async () => await expectFolding(2, 2, 0));
          it('should return post whith 3 comments without folding', async () => await expectFolding(3, 3, 0));
          it('should return post whith 4 comments with folding', async () => await expectFolding(4, 2, 2));
          it('should return post whith 5 comments with folding', async () => await expectFolding(5, 2, 3));
        });

        describe('Unfolded comments', () => {
          it('should return post whith 1 comment without folding', async () => await expectFolding(1, 1, 0, true));
          it('should return post whith 2 comments without folding', async () => await expectFolding(2, 2, 0, true));
          it('should return post whith 3 comments without folding', async () => await expectFolding(3, 3, 0, true));
          it('should return post whith 4 comments without folding', async () => await expectFolding(4, 4, 0, true));
          it('should return post whith 5 comments without folding', async () => await expectFolding(5, 5, 0, true));
        });
      });

      describe('Likes folding test', () => {
        let users;
        beforeEach(async () => {
          const promises = [];

          for (let n = 0; n < 5; n++) {
            promises.push(createUserAsync(`username${n + 1}`, 'pw'));
          }

          users = await Promise.all(promises);
        });

        const expectFolding = async (nLikes, expLikes, expOmitted, allLikes = false) => {
          await Promise.all(users.slice(0, nLikes).map((u) => like(lunaPost.id, u.authToken)));
          const post = await fetchPost(lunaPost.id, null, { allLikes });
          expect(post.posts.likes, 'to have length', expLikes);
          expect(post.posts.omittedLikes, 'to equal', expOmitted);
        };

        describe('Folded likes', () => {
          it('should return post whith 1 like without folding', async () => await expectFolding(1, 1, 0));
          it('should return post whith 2 likes without folding', async () => await expectFolding(2, 2, 0));
          it('should return post whith 3 likes without folding', async () => await expectFolding(3, 3, 0));
          it('should return post whith 4 likes without folding', async () => await expectFolding(4, 4, 0));
          it('should return post whith 5 likes with folding', async () => await expectFolding(5, 3, 2));
        });

        describe('Unfolded likes', () => {
          it('should return post whith 1 like without folding', async () => await expectFolding(1, 1, 0, true));
          it('should return post whith 2 likes without folding', async () => await expectFolding(2, 2, 0, true));
          it('should return post whith 3 likes without folding', async () => await expectFolding(3, 3, 0, true));
          it('should return post whith 4 likes without folding', async () => await expectFolding(4, 4, 0, true));
          it('should return post whith 5 likes without folding', async () => await expectFolding(5, 5, 0, true));
        });
      });

      describe('Luna is a public user', () => {
        it('should return post to anonymous', async () => {
          const post = await fetchPost(lunaPost.id);
          expect(post.posts.id, 'to be', lunaPost.id);
        });

        it('should return post to Luna', async () => {
          const post = await fetchPost(lunaPost.id, luna);
          expect(post.posts.id, 'to be', lunaPost.id);
        });

        it('should return post to Venus', async () => {
          const post = await fetchPost(lunaPost.id, venus);
          expect(post.posts.id, 'to be', lunaPost.id);
        });
      });

      describe('Luna is a protected user', () => {
        beforeEach(async () => await goProtected(luna));

        it('should not return post to anonymous', async () => {
          const resp = await fetchPost(lunaPost.id, null, { returnError: true });
          expect(resp, 'to satisfy', { status: 403 });
        });

        it('should return post to Luna', async () => {
          const post = await fetchPost(lunaPost.id, luna);
          expect(post.posts.id, 'to be', lunaPost.id);
        });

        it('should return post to Venus', async () => {
          const post = await fetchPost(lunaPost.id, venus);
          expect(post.posts.id, 'to be', lunaPost.id);
        });
      });

      describe('Luna is a private user', () => {
        beforeEach(async () => await goPrivate(luna));

        it('should not return post to anonymous', async () => {
          const resp = await fetchPost(lunaPost.id, null, { returnError: true });
          expect(resp, 'to satisfy', { status: 403 });
        });

        it('should return post to Luna', async () => {
          const post = await fetchPost(lunaPost.id, luna);
          expect(post.posts.id, 'to be', lunaPost.id);
        });

        it('should not return post to Venus', async () => {
          const resp = await fetchPost(lunaPost.id, venus, { returnError: true });
          expect(resp, 'to satisfy', { status: 403 });
        });

        it('should return post to Mars', async () => {
          const post = await fetchPost(lunaPost.id, mars);
          expect(post.posts.id, 'to be', lunaPost.id);
        });
      });

      describe('Open Graph test', () => {
        let lunaPostWithSpecialCharacters, lunaPostWithNewLines;

        beforeEach(async () => {
          lunaPostWithSpecialCharacters = await createAndReturnPost(luna, 'Test with tags <br>');
          lunaPostWithNewLines = await createAndReturnPost(luna, 'A\nB\nC');
        });

        describe('Luna is a public user', () => {
          it('should return information for a public post', async () => {
            const response = await fetchPostOpenGraph(lunaPost.id);
            response.should.include('og:title');
            response.should.include('luna');
            response.should.include('<meta property="og:description" content="Luna post" />');
          });

          it('should escape special characters', async () => {
            const response = await fetchPostOpenGraph(lunaPostWithSpecialCharacters.id);
            response.should.include('<meta property="og:description" content="Test with tags &lt;br&gt;" />');
          });

          it('should support new lines', async () => {
            const response = await fetchPostOpenGraph(lunaPostWithNewLines.id);
            response.should.include('<meta property="og:description" content="A\nB\nC" />');
          });
        });

        describe('Luna is a protected user', () => {
          beforeEach(async () => await goProtected(luna));

          it('should not return any information for a protected post', async () => {
            const response = await fetchPostOpenGraph(lunaPost.id);
            response.should.be.empty;
          });
        });

        describe('Luna is a private user', () => {
          beforeEach(async () => await goPrivate(luna));

          it('should not return any information for a private post', async () => {
            const response = await fetchPostOpenGraph(lunaPost.id);
            response.should.be.empty;
          });
        });
      });
    });
    describe('Luna wrote post and 3 attachments', () => {
      let luna;
      let attId1, attId2, attId3;
      beforeEach(async () => {
        luna = await createUserAsync('luna', 'pw');
        luna.post = await createAndReturnPost(luna, 'Luna post');
        attId1 = (await createMockAttachmentAsync(luna)).id;
        attId2 = (await createMockAttachmentAsync(luna)).id;
        attId3 = (await createMockAttachmentAsync(luna)).id;
      });

      it('should return post with [1, 2, 3] attachments in the correct order', async () => {
        const postData = {
          body:        luna.post.body,
          attachments: [attId1, attId2, attId3],
        };
        await updatePostAsync(luna, postData);
        const { posts } = await fetchPost(luna.post.id);
        expect(posts.attachments, 'to equal', postData.attachments);
      });

      it('should return post with [3, 1, 2] attachments in the correct order', async () => {
        const postData = {
          body:        luna.post.body,
          attachments: [attId3, attId1, attId2],
        };
        await updatePostAsync(luna, postData);
        const { posts } = await fetchPost(luna.post.id);
        expect(posts.attachments, 'to equal', postData.attachments);
      });

      it('should return post after attachment deletion with attachments in the correct order', async () => {
        const postData = {
          body:        luna.post.body,
          attachments: [attId3, attId1, attId2],
        };
        await updatePostAsync(luna, postData);
        postData.attachments = [attId3, attId2];
        await updatePostAsync(luna, postData);
        const { posts } = await fetchPost(luna.post.id);
        expect(posts.attachments, 'to equal', postData.attachments);
      });

      it('should return post after attachment addition with attachments in the correct order', async () => {
        const postData = {
          body:        luna.post.body,
          attachments: [attId1, attId2],
        };
        await updatePostAsync(luna, postData);
        postData.attachments = [attId3, attId2, attId1];
        await updatePostAsync(luna, postData);
        const { posts } = await fetchPost(luna.post.id);
        expect(posts.attachments, 'to equal', postData.attachments);
      });

      describe('Luna wrote another post', () => {
        let post1, post2;
        beforeEach(async () => {
          post1 = luna.post;
          post2 = await createAndReturnPost(luna, 'Luna post 2');
        });

        it('should not allow to rebind attachment from post1 to post2', async () => {
          luna.post = post1;
          await updatePostAsync(luna, { body: post1.body, attachments: [attId1] });
          luna.post = post2;
          const resp = await updatePostAsync(luna, { body: post2.body, attachments: [attId1] });
          expect(resp.status, 'to be', 403);
        });
      });

      describe('Mars also wrote post', () => {
        let mars;
        beforeEach(async () => {
          mars = await createUserAsync('mars', 'pw');
          mars.post = await createAndReturnPost(mars, 'Mars post');
        });

        it('should not allow Mars to steal Luna attachments', async () => {
          const postData = {
            body:        mars.post.body,
            attachments: [attId1, attId2],
          };
          const resp = await updatePostAsync(mars, postData);
          expect(resp.status, 'to be', 403);
        });
      });
    });

    describe('Luna wrote post and hide it', () => {
      let luna;
      beforeEach(async () => {
        luna = await createUserAsync('luna', 'pw');
        luna.post = await createAndReturnPost(luna, 'Luna post');
        await hidePost(luna.post.id, luna);
      });

      it('should return post to Luna with truthy isHidden property', async () => {
        const { posts } = await fetchPost(luna.post.id, luna);
        expect(posts, 'to have key', 'isHidden'); // it is true because of schema
      });
    });
  });
});

const postOpenGraphFetcher = (app) => async (postId) => {
  const res = await fetch(`${app.context.config.host}/v2/posts-opengraph/${postId}`);

  if (res.status !== 200) {
    expect.fail('HTTP error (code {0})', res.status);
  }

  return await res.text();
};
