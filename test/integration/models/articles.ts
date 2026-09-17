import { beforeEach, describe, it } from 'mocha';
import unexpected from 'unexpected';
import unexpectedDate from 'unexpected-date';
import { sql } from 'slonik';
import { z } from 'zod';

import { dbAdapter, User } from '../../../app/models';
import cleanDB from '../../dbCleaner';
import { createUser } from '../helpers/users';
import type { Article, ArticleDbRowContent } from '../../../app/models/article';
import type { UUID } from '../../../app/support/types';
import { currentConfig } from '../../../app/support/app-async-context';

const expect = unexpected.clone();
expect.use(unexpectedDate);

describe('Articles model', () => {
  beforeEach(() => cleanDB(dbAdapter.database));

  const ARTICLE_CONTENT = {
    title: 'Test Article',
    slug: 'test-article',
    digest: 'test-digest',
    body: { blocks: [{ type: 'test', content: 'Test content' }] },
  } satisfies ArticleDbRowContent;

  const UPDATED_CONTENT = makeContent('Updated');
  const OTHER_CONTENT = makeContent('Other');
  const FINAL_CONTENT = makeContent('Final');

  let luna: User;
  let article: Article;
  beforeEach(async () => {
    luna = await createUser('luna');
    article = await dbAdapter.createArticle({ author_id: luna.id, ...ARTICLE_CONTENT });
  });

  it('should create a valid article without revisions and with a short ID', async () => {
    expect(article, 'not to be null');
    expect(article, 'to satisfy', {
      authorId: luna.id,
      ...ARTICLE_CONTENT,
      createdAt: expect.it('to be a date'),
      updatedAt: expect.it('to be a date'),
      version: 1,
      postId: null,
    });

    expect(await article.getRevisions(10, 0), 'to be empty');

    const shortId = await article.getShortId();
    const { initialLength, maxLength } = currentConfig().shortLinks;

    expect(shortId, 'to be a string');
    expect(shortId, 'to match', RegExp(`^[a-f0-9]{${initialLength.article},${maxLength}}$`));
    expect(await dbAdapter.getArticleByShortId(shortId), 'to satisfy', {
      uid: article.uid,
    });
  });

  it('should return null for unknown IDs', async () => {
    const unknownId = '00000000-0000-0000-0000-000000000000' as UUID;

    expect(await dbAdapter.getArticleById(unknownId), 'to be null');
    expect(await dbAdapter.getArticleRevisionById(unknownId), 'to be null');
    expect(await dbAdapter.getArticleByShortId('fffffffffff'), 'to be null');
  });

  it('should update the article and archive its previous state', async () => {
    expect(await article.update(1, UPDATED_CONTENT), 'to equal', {
      status: 'updated',
      version: 2,
    });
    expect(article, 'to satisfy', { ...UPDATED_CONTENT, version: 2 });
    expect(await dbAdapter.getArticleById(article.uid), 'to satisfy', {
      ...UPDATED_CONTENT,
      version: 2,
    });

    const revisions = await article.getRevisions(10, 0);

    expect(revisions, 'to satisfy', [
      {
        articleId: article.uid,
        ...ARTICLE_CONTENT,
        createdAt: expect.it('to be a date'),
        version: 1,
      },
    ]);
  });

  it('should not create a revision for unchanged content', async () => {
    expect(await article.update(1, structuredClone(ARTICLE_CONTENT)), 'to equal', {
      status: 'unchanged',
    });

    const stored = await dbAdapter.getArticleById(article.uid);

    expect(stored, 'to satisfy', { ...ARTICLE_CONTENT, version: 1 });
    expect(stored?.updatedAt.getTime(), 'to be', article.updatedAt.getTime());
    expect(await article.getRevisions(10, 0), 'to be empty');
  });

  it('should reject an update based on a stale version', async () => {
    const staleArticle = await dbAdapter.getArticleById(article.uid);

    expect(staleArticle, 'not to be null');
    expect(await article.update(1, UPDATED_CONTENT), 'to equal', {
      status: 'updated',
      version: 2,
    });
    expect(await staleArticle?.update(1, OTHER_CONTENT), 'to equal', { status: 'conflict' });
    expect(await dbAdapter.getArticleById(article.uid), 'to satisfy', {
      ...UPDATED_CONTENT,
      version: 2,
    });
    expect(await article.getRevisions(10, 0), 'to have length', 1);
  });

  it('should serialize concurrent updates of the same version', async () => {
    const firstArticle = await dbAdapter.getArticleById(article.uid);
    const secondArticle = await dbAdapter.getArticleById(article.uid);

    expect(firstArticle, 'not to be null');
    expect(secondArticle, 'not to be null');

    const results = await Promise.all([
      firstArticle?.update(1, UPDATED_CONTENT),
      secondArticle?.update(1, OTHER_CONTENT),
    ]);
    const statuses = results.map((result) => result?.status).sort();
    const winningContent = results[0]?.status === 'updated' ? UPDATED_CONTENT : OTHER_CONTENT;

    expect(statuses, 'to equal', ['conflict', 'updated']);
    expect(await dbAdapter.getArticleById(article.uid), 'to satisfy', {
      ...winningContent,
      version: 2,
    });
    expect(await article.getRevisions(10, 0), 'to satisfy', [{ ...ARTICLE_CONTENT, version: 1 }]);
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
    expect(await article.getRevisions(1, 1), 'to satisfy', [{ version: 2 }]);
    expect(await dbAdapter.getArticleRevisionById(descending[0].uid), 'to satisfy', {
      articleId: article.uid,
      ...OTHER_CONTENT,
      version: 3,
    });
    expect(await dbAdapter.getArticleById(article.uid), 'to satisfy', {
      ...FINAL_CONTENT,
      version: 4,
    });
  });

  it('should delete the article and preserve its short ID tombstone', async () => {
    await article.update(1, UPDATED_CONTENT);
    const shortId = await article.getShortId();

    expect(await article.destroy(), 'to be', true);
    expect(await article.destroy(), 'to be', false);
    expect(await dbAdapter.getArticleById(article.uid), 'to be null');
    expect(await dbAdapter.getArticleByShortId(shortId), 'to be null');
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

function makeContent(prefix: string): ArticleDbRowContent {
  return {
    title: `${prefix} Article`,
    slug: `${prefix.toLowerCase()}-article`,
    digest: `${prefix} digest`,
    body: { blocks: [{ type: 'test', content: `${prefix} content` }] },
  };
}
