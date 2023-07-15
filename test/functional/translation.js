/* eslint-disable no-await-in-loop */
/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../dbCleaner';
import { dbAdapter } from '../../app/models';

import {
  createTestUsers,
  createAndReturnPost,
  performJSONRequest,
  authHeaders,
  createCommentAsync,
  goPrivate,
  withModifiedAppConfig,
} from './functional_test_helper';

describe('Text translation', () => {
  let luna, mars;
  let post, comment;

  beforeEach(() => cleanDB($pg_database));

  beforeEach(async () => {
    [luna, mars] = await createTestUsers(['luna', 'mars']);
    post = await createAndReturnPost(luna, 'Just a post');
    comment = await createCommentAsync(luna, post.id, 'Just a comment')
      .then((r) => r.json())
      .then((r) => r.comments);
  });

  it(`should not allow anonymous user to translate post`, async () => {
    const result = await translatePost(post.id);
    expect(result, 'to satisfy', { __httpCode: 401 });
  });

  it(`should not allow anonymous user to translate comment`, async () => {
    const result = await translateComment(comment.id);
    expect(result, 'to satisfy', { __httpCode: 401 });
  });

  it(`should allow Mars to translate post`, async () => {
    const result = await translatePost(post.id, mars);
    expect(result, 'to satisfy', {
      __httpCode: 200,
      translatedText: 'tsop a tsuJ',
      detectedLang: 'ne',
    });
  });

  it(`should allow Mars to translate post to 'ru-RU'`, async () => {
    const result = await translatePost(post.id, mars, 'ru-RU');
    expect(result, 'to satisfy', {
      __httpCode: 200,
      translatedText: 'tsop a tsuJ',
      detectedLang: 'UR-ur',
    });
  });

  it(`should allow Mars to translate post to 'ru-RU' using Accept-Language header`, async () => {
    const result = await performJSONRequest('GET', `/v2/posts/${post.id}/translated-body`, null, {
      ...authHeaders(mars),
      'Accept-Language': 'ru-RU,en,cz',
    });
    expect(result, 'to satisfy', {
      __httpCode: 200,
      translatedText: 'tsop a tsuJ',
      detectedLang: 'UR-ur',
    });
  });

  it(`should allow Mars to translate comment`, async () => {
    const result = await translateComment(comment.id, mars);
    expect(result, 'to satisfy', {
      __httpCode: 200,
      translatedText: 'tnemmoc a tsuJ',
      detectedLang: 'ne',
    });
  });

  describe('Luna became private', () => {
    beforeEach(() => goPrivate(luna));

    it(`should allow Luna to translate post`, async () => {
      const result = await translatePost(post.id, luna);
      expect(result, 'to satisfy', {
        __httpCode: 200,
        translatedText: 'tsop a tsuJ',
        detectedLang: 'ne',
      });
    });

    it(`should allow Luna to translate comment`, async () => {
      const result = await translateComment(comment.id, luna);
      expect(result, 'to satisfy', {
        __httpCode: 200,
        translatedText: 'tnemmoc a tsuJ',
        detectedLang: 'ne',
      });
    });

    it(`should not allow Mars to translate post`, async () => {
      const result = await translatePost(post.id, mars);
      expect(result, 'to satisfy', { __httpCode: 403 });
    });

    it(`should not allow Mars to translate comment`, async () => {
      const result = await translateComment(comment.id, mars);
      expect(result, 'to satisfy', { __httpCode: 403 });
    });
  });

  describe('Limits', () => {
    withModifiedAppConfig({
      translation: {
        limits: {
          userCharactersPerDay: 20,
        },
      },
    });

    beforeEach(() => dbAdapter.cache.reset());

    it(`should allow to translate the same text multiple times thanks to caching`, async () => {
      for (let i = 0; i < 5; i++) {
        // eslint-disable-next-line no-await-in-loop
        const result = await translatePost(post.id, mars);
        expect(result, 'to satisfy', { __httpCode: 200 });
      }
    });

    it(`should reach the limit without caching`, async () => {
      for (let i = 0; i < 2; i++) {
        const result = await translatePost(post.id, mars);
        await dbAdapter.cache.reset();
        expect(result, 'to satisfy', { __httpCode: 200 });
      }

      {
        const result = await translatePost(post.id, mars);
        await dbAdapter.cache.reset();
        expect(result, 'to satisfy', { __httpCode: 403 });
      }
    });
  });
});

function translatePost(postId, userCtx, lang = null) {
  const qs = lang ? `?lang=${lang}` : '';
  return performJSONRequest(
    'GET',
    `/v2/posts/${postId}/translated-body${qs}`,
    null,
    authHeaders(userCtx),
  );
}

function translateComment(commentId, userCtx, lang = null) {
  const qs = lang ? `?lang=${lang}` : '';
  return performJSONRequest(
    'GET',
    `/v2/comments/${commentId}/translated-body${qs}`,
    null,
    authHeaders(userCtx),
  );
}
