import { afterEach, before, beforeEach, describe, it } from 'mocha';
import expect from 'unexpected';

import { getSingleton } from '../../app/app';
import { dbAdapter, PubSub } from '../../app/models';
import type { Article, ArticleDbRowContent } from '../../app/models/article';
import { DummyPublisher } from '../../app/pubsub';
import { connect as redisConnection } from '../../app/setup/database';
import { eventNames, PubSubAdapter } from '../../app/support/PubSubAdapter';
import type { UUID } from '../../app/support/types';
import cleanDB from '../dbCleaner';
import { createPost } from '../integration/helpers/posts-and-comments';

import { authHeaders, createTestUser, performJSONRequest } from './functional_test_helper';
import type { UserCtx } from './functional_test_helper';
import Session from './realtime-session';

const content = {
  title: 'Test article',
  digest: 'Test digest',
  body: { blocks: [{ id: 'text', type: 'text', content: 'Hello' }] },
} satisfies ArticleDbRowContent;

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
        `/v4/articles/${article.uid}/post`,
        undefined,
        authHeaders(luna),
      );

      expect(response, 'to satisfy', {
        __httpCode: 200,
        article: { id: article.uid, postId: null },
      });
      expect(await dbAdapter.getArticleById(article.uid), 'to satisfy', { postId: null });
    });

    it('should not let another user detach the article', async () => {
      const mars = await createTestUser('mars');
      const response = await performJSONRequest(
        'DELETE',
        `/v4/articles/${article.uid}/post`,
        undefined,
        authHeaders(mars),
      );

      expect(response, 'to satisfy', { __httpCode: 403 });
      expect(await dbAdapter.getArticleById(article.uid), 'to satisfy', { postId });
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
            `/v4/articles/${article.uid}/post`,
            undefined,
            authHeaders(luna),
          ),
        );

        await expect(event, 'when fulfilled', 'to satisfy', {
          posts: { id: postId, articleId: null },
        });
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
              post: { body: 'New post', articleId: unpublishedArticle.uid },
              meta: { feeds: [luna.username] },
            },
            authHeaders(luna),
          ),
        );

        await expect(event, 'when fulfilled', 'to satisfy', {
          posts: { articleId: unpublishedArticle.uid },
        });
      });
    });
  });
});
