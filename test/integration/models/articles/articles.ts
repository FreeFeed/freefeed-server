import { beforeEach, describe, it } from 'mocha';
import unexpected from 'unexpected';
import unexpectedDate from 'unexpected-date';
import { sql } from 'slonik';
import { z } from 'zod';

import { dbAdapter, User } from '../../../../app/models';
import type { Article, ArticleEditableContent } from '../../../../app/models/article';
import { currentConfig } from '../../../../app/support/app-async-context';
import type { UUID } from '../../../../app/support/types';
import cleanDB from '../../../dbCleaner';
import { createUser } from '../../helpers/users';

const expect = unexpected.clone();
expect.use(unexpectedDate);

describe('Articles model', () => {
  beforeEach(() => cleanDB(dbAdapter.database));

  const ARTICLE_CONTENT = {
    digest: 'test-digest',
    body: '# Test **Article**\n\nTest content',
  } satisfies ArticleEditableContent;
  const UPDATED_CONTENT = makeContent('Updated');
  const OTHER_CONTENT = makeContent('Other');
  const FINAL_CONTENT = makeContent('Final');

  let luna: User;
  let article: Article;

  beforeEach(async () => {
    luna = await createUser('luna');
    article = await dbAdapter.createArticle({ author_id: luna.id, ...ARTICLE_CONTENT });
  });

  it('should create an article with a derived title, unchanged body, and no revisions', async () => {
    expect(article, 'to satisfy', {
      authorId: luna.id,
      title: 'Test Article',
      ...ARTICLE_CONTENT,
      createdAt: expect.it('to be a date'),
      updatedAt: expect.it('to be a date'),
      version: 1,
      postId: null,
    });
    expect(await article.getRevisions(10, 0), 'to be empty');

    const shortId = await article.getShortId();
    const { initialLength, maxLength } = currentConfig().shortLinks;
    expect(shortId, 'to match', RegExp(`^[a-f0-9]{${initialLength.article},${maxLength}}$`));
  });

  it('should reject a non-string body without creating an article', async () => {
    await expect(
      dbAdapter.createArticle({
        author_id: luna.id,
        digest: '',
        body: { blocks: [] },
      } as unknown as Parameters<typeof dbAdapter.createArticle>[0]),
      'to be rejected with error satisfying',
      { status: 422 },
    );

    expect(await dbAdapter.database('articles').where({ author_id: luna.id }), 'to have length', 1);
  });

  it('should update the article and archive only the previous body and title', async () => {
    expect(await article.update(1, UPDATED_CONTENT), 'to equal', {
      status: 'updated',
      version: 2,
    });
    expect(await dbAdapter.getArticleById(article.id), 'to satisfy', {
      ...UPDATED_CONTENT,
      title: 'Updated Article',
      version: 2,
    });
    expect(await article.getRevisions(10, 0), 'to satisfy', [
      {
        articleId: article.id,
        title: 'Test Article',
        body: ARTICLE_CONTENT.body,
        version: 1,
      },
    ]);
  });

  it('should increment the version without a revision when only digest changes', async () => {
    expect(await article.update(1, { ...ARTICLE_CONTENT, digest: 'new-digest' }), 'to equal', {
      status: 'updated',
      version: 2,
    });
    expect(await dbAdapter.getArticleById(article.id), 'to satisfy', {
      digest: 'new-digest',
      version: 2,
    });
    expect(await article.getRevisions(10, 0), 'to be empty');
  });

  it('should update title and digest search vectors', async () => {
    const createdVectors = await getArticleSearchVectors(article.id);
    expect(createdVectors.title, 'to contain', '=article');
    expect(createdVectors.digest, 'to contain', '=digest');

    await article.update(1, { body: '# Quasar', digest: 'Nebula' });

    const updatedVectors = await getArticleSearchVectors(article.id);
    expect(updatedVectors.title, 'to contain', '=quasar');
    expect(updatedVectors.title, 'not to contain', '=article');
    expect(updatedVectors.digest, 'to contain', '=nebula');
    expect(updatedVectors.digest, 'not to contain', '=digest');
  });

  it('should not change the version for unchanged content', async () => {
    expect(await article.update(1, ARTICLE_CONTENT), 'to equal', { status: 'unchanged' });
    expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { version: 1 });
    expect(await article.getRevisions(10, 0), 'to be empty');
  });

  it('should reject an update based on a stale version', async () => {
    const staleArticle = await dbAdapter.getArticleById(article.id);
    await article.update(1, UPDATED_CONTENT);

    expect(await staleArticle?.update(1, OTHER_CONTENT), 'to equal', { status: 'conflict' });
    expect(await dbAdapter.getArticleById(article.id), 'to satisfy', {
      ...UPDATED_CONTENT,
      version: 2,
    });
  });

  it('should serialize concurrent updates of the same version', async () => {
    const firstArticle = await dbAdapter.getArticleById(article.id);
    const secondArticle = await dbAdapter.getArticleById(article.id);
    const results = await Promise.all([
      firstArticle?.update(1, UPDATED_CONTENT),
      secondArticle?.update(1, OTHER_CONTENT),
    ]);

    expect(results.map((result) => result?.status).sort(), 'to equal', ['conflict', 'updated']);
    expect(await article.getRevisions(10, 0), 'to satisfy', [
      { title: 'Test Article', body: ARTICLE_CONTENT.body, version: 1 },
    ]);
  });

  it('should list and retrieve revisions', async () => {
    await article.update(1, UPDATED_CONTENT);
    await article.update(2, OTHER_CONTENT);
    await article.update(3, FINAL_CONTENT);

    const descending = await article.getRevisions(10, 0);
    const ascending = await article.getRevisions(10, 0, false);
    expect(
      descending.map(({ version }) => version),
      'to equal',
      [3, 2, 1],
    );
    expect(
      ascending.map(({ version }) => version),
      'to equal',
      [1, 2, 3],
    );
    expect(await dbAdapter.getArticleRevisionById(descending[0].uid), 'to satisfy', {
      articleId: article.id,
      title: 'Other Article',
      body: OTHER_CONTENT.body,
      version: 3,
    });
  });

  it('should set ordered tags without changing the article version', async () => {
    await article.setTags(['Second', 'First']);

    expect(await getArticleTagState(article.id), 'to equal', {
      articleTags: [
        { name: 'second', ord: 1 },
        { name: 'first', ord: 2 },
      ],
      usageTags: ['first', 'second'],
    });
    expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { version: 1 });
  });

  it('should replace and clear article tags', async () => {
    await article.setTags(['one', 'two']);
    await article.setTags(['two', 'three']);
    expect(await article.getTags(), 'to equal', ['two', 'three']);

    await article.setTags([]);
    expect(await getArticleTagState(article.id), 'to equal', {
      articleTags: [],
      usageTags: [],
    });
  });

  it('should serialize concurrent tag replacements', async () => {
    await Promise.all([article.setTags(['one', 'two']), article.setTags(['three', 'four'])]);
    const state = await getArticleTagState(article.id);
    const orderedNames = state.articleTags.map(({ name }) => name);

    expect(['one,two', 'three,four'], 'to contain', orderedNames.join(','));
    expect(state.usageTags, 'to equal', [...orderedNames].sort());
  });

  it('should delete the article and preserve its short ID tombstone', async () => {
    await article.update(1, UPDATED_CONTENT);
    await article.setTags(['one', 'two']);
    const shortId = await article.getShortId();

    expect(await article.destroy(), 'to be', true);
    expect(await article.destroy(), 'to be', false);
    expect(await dbAdapter.getArticleById(article.id), 'to be null');
    expect(await article.getRevisions(10, 0), 'to be empty');
    expect(await article.update(2, OTHER_CONTENT), 'to equal', { status: 'not-found' });

    const pool = await dbAdapter.getSlonik();
    expect(
      await pool.one(
        sql.type(z.object({ short_id: z.string(), long_id: z.uuid().nullable() }))`
          select short_id, long_id from article_short_ids where short_id = ${shortId}
        `,
      ),
      'to satisfy',
      { short_id: shortId, long_id: null },
    );
  });
});

function makeContent(prefix: string): ArticleEditableContent {
  return { digest: `${prefix} digest`, body: `# ${prefix} Article\n\n${prefix} content` };
}

const articleTagQuery = sql.type(z.object({ name: z.string(), ord: z.number().int() }));
const hashtagNameQuery = sql.type(z.object({ name: z.string() }));
const articleSearchVectorQuery = sql.type(z.object({ title: z.string(), digest: z.string() }));

async function getArticleSearchVectors(articleId: UUID) {
  const pool = await dbAdapter.getSlonik();
  return pool.one(
    articleSearchVectorQuery`select title_tsvector::text as title,
      digest_tsvector::text as digest from articles where uid = ${articleId}`,
  );
}

async function getArticleTagState(articleId: UUID) {
  const pool = await dbAdapter.getSlonik();
  const [articleTags, usageTags] = await Promise.all([
    pool.any(
      articleTagQuery`select h.name, at.ord
        from article_tags at join hashtags h on h.id = at.tag_id
        where at.article_id = ${articleId} order by at.ord`,
    ),
    pool.any(
      hashtagNameQuery`select h.name
        from hashtag_usages hu join hashtags h on h.id = hu.hashtag_id
        where hu.entity_id = ${articleId} and hu.type = ${'article'} order by h.name`,
    ),
  ]);

  return {
    articleTags: [...articleTags],
    usageTags: usageTags.map(({ name }) => name),
  };
}
