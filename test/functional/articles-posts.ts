import { afterEach, before, beforeEach, describe, it } from 'mocha';
import expect from 'unexpected';

import { getSingleton } from '../../app/app';
import { dbAdapter, PubSub } from '../../app/models';
import type { Article, ArticleEditableContent } from '../../app/models/article';
import { DummyPublisher } from '../../app/pubsub';
import { connect as redisConnection } from '../../app/setup/database';
import { eventNames, PubSubAdapter } from '../../app/support/PubSubAdapter';
import type { UUID } from '../../app/support/types';
import { UNDO_ARTICLE_DETACH, UndoArticleDetach } from '../../app/support/undo/article-detach';
import cleanDB from '../dbCleaner';
import { createPost } from '../integration/helpers/posts-and-comments';

import { authHeaders, createTestUser, performJSONRequest } from './functional_test_helper';
import type { UserCtx } from './functional_test_helper';
import Session from './realtime-session';

const content = {
  digest: 'Test digest',
  body: '# Test article\n\nHello',
} satisfies ArticleEditableContent;

describe('Articles API: post association', () => {
  let luna: UserCtx;

  beforeEach(async () => {
    await cleanDB(dbAdapter.database);
    luna = await createTestUser('luna');
  });

  describe('Detach from post', () => {
    let article: Article;
    let postId: UUID;

    beforeEach(async () => {
      article = await dbAdapter.createArticle({ author_id: luna.user.id, ...content });
      const post = await createPost(luna.user, 'Public post');
      postId = post.id;
      await article.setPost(postId);
    });

    it('should detach the article from its post', async () => {
      const response = await performJSONRequest(
        'DELETE',
        `/v4/articles/${article.id}/post`,
        undefined,
        authHeaders(luna),
      );

      expect(response, 'to satisfy', {
        __httpCode: 200,
        article: { id: article.id, postId: null },
        undo: [
          {
            subject: UNDO_ARTICLE_DETACH,
            message: 'You detached your article from its post',
            messageParams: {},
            expiresInSec: UndoArticleDetach.ttlSec,
            token: expect.it('to be a string'),
          },
        ],
      });
      expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { postId: null });
    });

    it('should not return an undo entry for an unpublished article', async () => {
      await article.setPost(null);
      const response = await performJSONRequest(
        'DELETE',
        `/v4/articles/${article.id}/post`,
        undefined,
        authHeaders(luna),
      );

      expect(response, 'to satisfy', { __httpCode: 200, undo: [] });
    });

    describe('Undo', () => {
      let token: string;

      const undo = (user: UserCtx = luna) =>
        performJSONRequest('POST', `/v4/undo/${UNDO_ARTICLE_DETACH}`, { token }, authHeaders(user));

      beforeEach(async () => {
        const response = await performJSONRequest<{ undo: [{ token: string }] }>(
          'DELETE',
          `/v4/articles/${article.id}/post`,
          undefined,
          authHeaders(luna),
        );
        [{ token }] = response.undo;
      });

      it('should attach the article to its post again', async () => {
        const response = await undo();

        expect(response, 'to satisfy', {
          __httpCode: 200,
          article: { id: article.id, postId },
          posts: [{ id: postId, articleId: article.id }],
        });
        expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { postId });
      });

      it('should not accept the token of another user', async () => {
        const mars = await createTestUser('mars');
        const response = await undo(mars);

        expect(response, 'to satisfy', { __httpCode: 403 });
        expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { postId: null });
      });

      it('should fail if the post has been deleted', async () => {
        await performJSONRequest('DELETE', `/v4/posts/${postId}`, undefined, authHeaders(luna));
        const response = await undo();

        expect(response, 'to satisfy', { __httpCode: 409 });
        expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { postId: null });
      });

      it('should fail if the article has been published with another post', async () => {
        const newPost = await performJSONRequest<{ posts: { id: UUID } }>(
          'POST',
          '/v4/posts',
          { post: { body: 'New post', articleId: article.id }, meta: { feeds: [luna.username] } },
          authHeaders(luna),
        );
        const response = await undo();

        expect(response, 'to satisfy', { __httpCode: 409 });
        expect(await dbAdapter.getArticleById(article.id), 'to satisfy', {
          postId: newPost.posts.id,
        });
      });

      it('should fail if the article has been deleted', async () => {
        await article.deactivate();
        const response = await undo();

        expect(response, 'to satisfy', { __httpCode: 404 });
      });
    });

    it('should not let another user detach the article', async () => {
      const mars = await createTestUser('mars');
      const response = await performJSONRequest(
        'DELETE',
        `/v4/articles/${article.id}/post`,
        undefined,
        authHeaders(mars),
      );

      expect(response, 'to satisfy', { __httpCode: 403 });
      expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { postId });
    });

    describe('Realtime', () => {
      let port: string | number;
      let session: Session;

      before(async () => {
        const app = await getSingleton();
        port = process.env.PEPYATKA_SERVER_PORT || app.context.config.port;
      });

      beforeEach(async () => {
        PubSub.setPublisher(new PubSubAdapter(redisConnection()));
        session = await Session.create(port, 'Luna');
        await session.sendAsync('auth', { authToken: luna.authToken });
        const postsTimeline = await luna.user.getPostsTimeline();

        if (!postsTimeline) {
          throw new Error('Posts timeline not found');
        }

        await session.sendAsync('subscribe', { timeline: [postsTimeline.id] });
      });

      afterEach(() => {
        session.disconnect();
        PubSub.setPublisher(new DummyPublisher());
      });

      it(`should publish '${eventNames.POST_UPDATED}' for the detached post`, async () => {
        const event = session.receiveWhile(eventNames.POST_UPDATED, () =>
          performJSONRequest(
            'DELETE',
            `/v4/articles/${article.id}/post`,
            undefined,
            authHeaders(luna),
          ),
        );

        await expect(event, 'when fulfilled', 'to satisfy', {
          posts: { id: postId, articleId: null },
        });
      });

      it(`should publish '${eventNames.POST_UPDATED}' when the article title changes`, async () => {
        const event = session.receiveWhile(eventNames.POST_UPDATED, () =>
          performJSONRequest(
            'PUT',
            `/v4/articles/${article.id}?expectedVersion=1`,
            { ...content, body: '# Updated title\n\nHello', tags: [] },
            authHeaders(luna),
          ),
        );

        await expect(event, 'when fulfilled', 'to satisfy', {
          posts: { id: postId, articleId: article.id },
          articles: [{ id: article.id, title: 'Updated title', digest: content.digest }],
        });
      });

      it(`should publish '${eventNames.POST_UPDATED}' when the article digest changes`, async () => {
        const event = session.receiveWhile(eventNames.POST_UPDATED, () =>
          performJSONRequest(
            'PUT',
            `/v4/articles/${article.id}?expectedVersion=1`,
            { ...content, digest: 'Updated digest', tags: [] },
            authHeaders(luna),
          ),
        );

        await expect(event, 'when fulfilled', 'to satisfy', {
          posts: { id: postId, articleId: article.id },
          articles: [{ id: article.id, title: 'Test article', digest: 'Updated digest' }],
        });
      });

      it(`should not publish '${eventNames.POST_UPDATED}' for a body-only change`, async () => {
        await session.notReceiveWhile(eventNames.POST_UPDATED, () =>
          performJSONRequest(
            'PUT',
            `/v4/articles/${article.id}?expectedVersion=1`,
            { ...content, body: '# Test article\n\nUpdated body', tags: [] },
            authHeaders(luna),
          ),
        );
      });

      it(`should include the article in '${eventNames.POST_CREATED}'`, async () => {
        const unpublishedArticle = await dbAdapter.createArticle({
          author_id: luna.user.id,
          ...content,
        });
        const event = session.receiveWhile(eventNames.POST_CREATED, () =>
          performJSONRequest(
            'POST',
            '/v4/posts',
            {
              post: { body: 'New post', articleId: unpublishedArticle.id },
              meta: { feeds: [luna.username] },
            },
            authHeaders(luna),
          ),
        );

        await expect(event, 'when fulfilled', 'to satisfy', {
          posts: { articleId: unpublishedArticle.id },
        });
      });
    });
  });
});
