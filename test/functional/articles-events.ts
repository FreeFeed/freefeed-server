import { beforeEach, describe, it } from 'mocha';
import expect from 'unexpected';

import { dbAdapter } from '../../app/models';
import type { Article, ArticleEditableContent } from '../../app/models/article';
import { EVENT_TYPES } from '../../app/support/EventTypes';
import type { UUID } from '../../app/support/types';
import cleanDB from '../dbCleaner';

import { authHeaders, createTestUser, performJSONRequest } from './functional_test_helper';
import type { UserCtx } from './functional_test_helper';

const content = (text: string): ArticleEditableContent => ({
  digest: 'Test digest',
  body: `# Test article\n\n${text}`,
});

describe('Article mention notifications', () => {
  let luna: UserCtx;
  let mars: UserCtx;
  let jupiter: UserCtx;

  beforeEach(async () => {
    await cleanDB(dbAdapter.database);
    [luna, mars, jupiter] = await Promise.all(
      ['luna', 'mars', 'jupiter'].map((username) => createTestUser(username)),
    );
  });

  const publish = (article: Article, body = 'Article announcement') =>
    performJSONRequest<{ posts: { id: UUID } }>(
      'POST',
      '/v4/posts',
      {
        post: { body, articleId: article.id },
        meta: { feeds: [luna.username] },
      },
      authHeaders(luna),
    );

  it('should notify a mentioned user when the article is published', async () => {
    const article = await dbAdapter.createArticle({
      author_id: luna.user.id,
      ...content('Hello @mars'),
    });

    expect(
      await dbAdapter.database('events').where({ event_type: EVENT_TYPES.MENTION_IN_ARTICLE }),
      'to be empty',
    );

    const publication = await publish(article);
    const notifications = await performJSONRequest(
      'GET',
      '/v4/notifications?filter=mentions',
      undefined,
      authHeaders(mars),
    );

    expect(publication, 'to satisfy', { __httpCode: 200 });
    expect(notifications, 'to satisfy', {
      __httpCode: 200,
      Notifications: [
        {
          event_type: EVENT_TYPES.MENTION_IN_ARTICLE,
          article_id: article.id,
          post_id: publication.posts.id,
        },
      ],
    });
  });

  it('should notify only newly mentioned users after a published article update', async () => {
    const article = await dbAdapter.createArticle({
      author_id: luna.user.id,
      ...content('Hello @mars'),
    });
    await publish(article);

    const response = await performJSONRequest(
      'PUT',
      `/v4/articles/${article.id}?expectedVersion=1`,
      { ...content('Hello @mars and @jupiter'), tags: [] },
      authHeaders(luna),
    );
    const events = await dbAdapter
      .database('events')
      .where({ article_id: article.id, event_type: EVENT_TYPES.MENTION_IN_ARTICLE })
      .orderBy('user_id');

    expect(response, 'to satisfy', { __httpCode: 200 });
    expect(
      events.map(({ user_id }) => user_id),
      'to equal',
      [mars.user.intId, jupiter.user.intId].sort((a, b) => a - b),
    );
  });

  it('should not notify the same user when the article is republished', async () => {
    const article = await dbAdapter.createArticle({
      author_id: luna.user.id,
      ...content('Hello @mars'),
    });
    await publish(article, 'First announcement');
    await performJSONRequest(
      'DELETE',
      `/v4/articles/${article.id}/post`,
      undefined,
      authHeaders(luna),
    );
    await publish(article, 'Second announcement');

    const events = await dbAdapter.database('events').where({
      article_id: article.id,
      event_type: EVENT_TYPES.MENTION_IN_ARTICLE,
      user_id: mars.user.intId,
    });

    expect(events, 'to have length', 1);
  });
});
