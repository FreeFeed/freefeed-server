import { beforeEach, describe, it } from 'mocha';
import unexpected from 'unexpected';
import unexpectedDate from 'unexpected-date';

import { initJobProcessing } from '../../../../app/jobs';
import { DELETE_ARTICLE } from '../../../../app/jobs/delete-article';
import { dbAdapter, User } from '../../../../app/models';
import type { Article, ArticleDbRowContent } from '../../../../app/models/article';
import { UndoArticleDelete } from '../../../../app/support/undo/article-delete';
import cleanDB from '../../../dbCleaner';
import { createUser } from '../../helpers/users';

const expect = unexpected.clone();
expect.use(unexpectedDate);

describe('Articles in to-delete state', () => {
  beforeEach(() => cleanDB(dbAdapter.database));

  const ARTICLE_CONTENT = {
    title: 'Test Article',
    digest: 'test-digest',
    body: { blocks: [{ id: '1', type: 'text', content: 'Test content' }] },
  } satisfies ArticleDbRowContent;

  let luna: User;
  let article: Article;
  beforeEach(async () => {
    luna = await createUser('luna');
    article = await dbAdapter.createArticle({ author_id: luna.id, ...ARTICLE_CONTENT });
    await article.deactivate();
  });

  it(`should be in 'toDelete' state`, async () => {
    expect(article.toDelete, 'to equal', true);
    expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { toDelete: true });
  });

  it('should ignore repeated deactivation', async () => {
    expect(await article.deactivate(), 'to equal', false);
    expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { toDelete: true });
  });

  it('should ignore repeated activation', async () => {
    expect(await article.activate(), 'to equal', true);
    expect(await article.activate(), 'to equal', false);
    expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { toDelete: false });
  });

  it('should schedule one deletion for concurrent deactivation', async () => {
    await article.activate();
    const [oldJob] = await dbAdapter.getAllJobs([DELETE_ARTICLE]);
    await oldJob.delete();
    const secondArticle = await dbAdapter.getArticleById(article.id);

    expect(secondArticle, 'not to be null');
    const results = await Promise.all([article.deactivate(), secondArticle?.deactivate()]);

    expect(results.sort(), 'to equal', [false, true]);
    expect(await dbAdapter.getAllJobs([DELETE_ARTICLE]), 'to satisfy', [
      {
        name: DELETE_ARTICLE,
        payload: { articleId: article.id },
      },
    ]);
  });

  describe('Job processing', () => {
    it(`should be scheduled to be deleted`, async () => {
      const jobs = await dbAdapter.getAllJobs([DELETE_ARTICLE]);
      expect(jobs, 'to satisfy', [
        {
          name: DELETE_ARTICLE,
          payload: { articleId: article.id },
        },
      ]);
      expect(
        jobs[0].unlockAt,
        'to be close to',
        new Date(jobs[0].createdAt.getTime() + UndoArticleDelete.ttlSec * 1000),
      );
    });

    it(`should reschedule deletion after restoration`, async () => {
      const [job] = await dbAdapter.getAllJobs([DELETE_ARTICLE]);
      await job.setUnlockAt(0);
      await article.activate();

      const [, now] = await Promise.all([article.deactivate(), dbAdapter.now()]);
      const jobs = await dbAdapter.getAllJobs([DELETE_ARTICLE]);

      expect(jobs, 'to have length', 1);
      expect(jobs[0].id, 'to equal', job.id);
      expect(
        jobs[0].unlockAt,
        'to be close to',
        new Date(now.getTime() + UndoArticleDelete.ttlSec * 1000),
      );
    });

    it(`should actually be deleted after job processing`, async () => {
      const [job] = await dbAdapter.getAllJobs([DELETE_ARTICLE]);
      job.setUnlockAt(0);

      const jm = await initJobProcessing();
      await jm.fetchAndProcess(1);
      expect(await dbAdapter.getArticleById(article.id), 'to be null');
    });

    it(`should not delete restored article`, async () => {
      const [job] = await dbAdapter.getAllJobs([DELETE_ARTICLE]);
      job.setUnlockAt(0);

      await article.activate();

      const jm = await initJobProcessing();
      await jm.fetchAndProcess(1);
      expect(await dbAdapter.getArticleById(article.id), 'to satisfy', { toDelete: false });
    });
  });
});
