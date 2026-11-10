import { afterEach, before, beforeEach, describe, it } from 'mocha';
import expect from 'unexpected';

import { getSingleton } from '../../app/app';
import { dbAdapter, PubSub } from '../../app/models';
import type { ArticleEditableContent } from '../../app/models/article';
import { DummyPublisher } from '../../app/pubsub';
import type { SerializedArticle, SerializedArticleFull } from '../../app/serializers/v2/articles';
import { connect as redisConnection } from '../../app/setup/database';
import { eventNames, PubSubAdapter } from '../../app/support/PubSubAdapter';
import { UNDO_ARTICLE_DELETE } from '../../app/support/undo/article-delete';
import cleanDB from '../dbCleaner';

import { authHeaders, createTestUser, performJSONRequest } from './functional_test_helper';
import type { UserCtx } from './functional_test_helper';
import Session from './realtime-session';

const content = {
  digest: 'Test digest',
  body: '# Test article\n\nHello',
} satisfies ArticleEditableContent;

type ArticleEvent = {
  article: SerializedArticle;
};

describe('Articles API: realtime', () => {
  let port: string | number;
  let luna: UserCtx;
  let mars: UserCtx;
  let lunaSession: Session;
  let marsSession: Session;

  before(async () => {
    const app = await getSingleton();
    port = process.env.PEPYATKA_SERVER_PORT || app.context.config.port;
  });

  beforeEach(async () => {
    await cleanDB(dbAdapter.database);
    [luna, mars] = await Promise.all(['luna', 'mars'].map((name) => createTestUser(name)));
    PubSub.setPublisher(new PubSubAdapter(redisConnection()));
    [lunaSession, marsSession] = await Promise.all([
      Session.create(port, 'Luna'),
      Session.create(port, 'Mars'),
    ]);
    await Promise.all([
      lunaSession.sendAsync('auth', { authToken: luna.authToken }),
      marsSession.sendAsync('auth', { authToken: mars.authToken }),
    ]);
    await Promise.all([
      lunaSession.sendAsync('subscribe', { user: [luna.user.id] }),
      marsSession.sendAsync('subscribe', { user: [mars.user.id] }),
    ]);
  });

  afterEach(() => {
    lunaSession.disconnect();
    marsSession.disconnect();
    PubSub.setPublisher(new DummyPublisher());
  });

  it(`should publish '${eventNames.ARTICLE_CREATED}' only to the author`, async () => {
    const authorEvent = lunaSession.receive(eventNames.ARTICLE_CREATED);
    const otherUserEvent = marsSession.notReceive(eventNames.ARTICLE_CREATED);
    const response = await performJSONRequest<{ article: SerializedArticleFull }>(
      'POST',
      '/v4/articles',
      { ...content, tags: ['First'] },
      authHeaders(luna),
    );
    const event: ArticleEvent = await authorEvent;

    await otherUserEvent;
    expect(event, 'to satisfy', {
      article: {
        id: response.article.id,
        authorId: luna.user.id,
        postId: null,
        title: 'Test article',
        digest: content.digest,
        tags: ['first'],
      },
    });
    expect(event.article, 'not to have key', 'body');
  });

  it(`should publish '${eventNames.ARTICLE_UPDATED}' after an article update`, async () => {
    const article = await dbAdapter.createArticle({ author_id: luna.user.id, ...content });
    const event: ArticleEvent = await lunaSession.receiveWhile(eventNames.ARTICLE_UPDATED, () =>
      performJSONRequest(
        'PUT',
        `/v4/articles/${article.id}?expectedVersion=1`,
        { digest: 'Updated digest', body: '# Updated title\n\nUpdated body', tags: ['Updated'] },
        authHeaders(luna),
      ),
    );

    expect(event, 'to satisfy', {
      article: {
        id: article.id,
        version: 2,
        title: 'Updated title',
        digest: 'Updated digest',
        tags: ['updated'],
      },
    });
    expect(event.article, 'not to have key', 'body');
  });

  it(`should publish '${eventNames.ARTICLE_UPDATED}' after a tags-only update`, async () => {
    const article = await dbAdapter.createArticle({ author_id: luna.user.id, ...content });
    const event: ArticleEvent = await lunaSession.receiveWhile(eventNames.ARTICLE_UPDATED, () =>
      performJSONRequest(
        'PUT',
        `/v4/articles/${article.id}?expectedVersion=1`,
        { ...content, tags: ['Updated'] },
        authHeaders(luna),
      ),
    );

    expect(event, 'to satisfy', {
      article: { id: article.id, version: 1, tags: ['updated'] },
    });
  });

  it(`should publish '${eventNames.ARTICLE_UPDATED}' on publication and detachment`, async () => {
    const article = await dbAdapter.createArticle({ author_id: luna.user.id, ...content });
    const postsTimeline = await luna.user.getPostsTimeline();

    if (!postsTimeline) {
      throw new Error('Posts timeline not found');
    }

    await marsSession.sendAsync('subscribe', { timeline: [postsTimeline.id] });

    const authorPublicationEvent = lunaSession.receive(eventNames.ARTICLE_UPDATED);
    const readerPublicationEvent = marsSession.receive(eventNames.ARTICLE_UPDATED);
    await performJSONRequest(
      'POST',
      '/v4/posts',
      {
        post: { body: 'Article announcement', articleId: article.id },
        meta: { feeds: [luna.username] },
      },
      authHeaders(luna),
    );

    expect(await authorPublicationEvent, 'to satisfy', {
      article: { id: article.id, postId: expect.it('to be a string') },
    });
    expect(await readerPublicationEvent, 'to satisfy', {
      article: { id: article.id, postId: expect.it('to be a string') },
    });

    const authorUpdateEvent = lunaSession.receive(eventNames.ARTICLE_UPDATED);
    const readerUpdateEvent = marsSession.receive(eventNames.ARTICLE_UPDATED);
    await performJSONRequest(
      'PUT',
      `/v4/articles/${article.id}?expectedVersion=1`,
      { ...content, body: '# Updated article', tags: [] },
      authHeaders(luna),
    );

    expect(await authorUpdateEvent, 'to satisfy', {
      article: { id: article.id, title: 'Updated article' },
    });
    const readerUpdate: ArticleEvent = await readerUpdateEvent;
    expect(readerUpdate, 'to satisfy', {
      article: { id: article.id, title: 'Updated article' },
    });
    expect(readerUpdate.article, 'not to have key', 'body');

    const authorDetachmentEvent = lunaSession.receive(eventNames.ARTICLE_UPDATED);
    const readerDetachmentEvent = marsSession.receive(eventNames.ARTICLE_DESTROYED);
    await performJSONRequest(
      'DELETE',
      `/v4/articles/${article.id}/post`,
      undefined,
      authHeaders(luna),
    );

    expect(await authorDetachmentEvent, 'to satisfy', {
      article: { id: article.id, postId: null },
    });
    expect(await readerDetachmentEvent, 'to satisfy', { meta: { articleId: article.id } });
  });

  it(`should publish '${eventNames.ARTICLE_DESTROYED}' and '${eventNames.ARTICLE_RESTORED}' on deletion and restoration`, async () => {
    const article = await dbAdapter.createArticle({ author_id: luna.user.id, ...content });
    const destroyEvent = lunaSession.receive(eventNames.ARTICLE_DESTROYED);
    const deletion = await performJSONRequest<{ undo: [{ token: string }] }>(
      'DELETE',
      `/v4/articles/${article.id}`,
      undefined,
      authHeaders(luna),
    );

    expect(await destroyEvent, 'to satisfy', { meta: { articleId: article.id } });

    const [{ token }] = deletion.undo;
    const restoreEvent: ArticleEvent = await lunaSession.receiveWhile(
      eventNames.ARTICLE_RESTORED,
      () =>
        performJSONRequest('POST', `/v4/undo/${UNDO_ARTICLE_DELETE}`, { token }, authHeaders(luna)),
    );

    expect(restoreEvent, 'to satisfy', { article: { id: article.id } });
    expect(restoreEvent.article, 'not to have key', 'body');
  });
});
