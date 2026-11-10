import { dbAdapter, Job, JobManager } from '../models';
import type { UUID } from '../support/types';
import { UndoArticleDelete } from '../support/undo/article-delete';

export const DELETE_ARTICLE = 'DELETE_ARTICLE';

export async function scheduleArticleDeletion(articleId: UUID) {
  await Job.create(
    DELETE_ARTICLE,
    { articleId },
    {
      uniqKey: articleId,
      unlockAt: UndoArticleDelete.ttlSec,
    },
  );
}

export function initHandlers(jobManager: JobManager) {
  jobManager.on(DELETE_ARTICLE, async (job: Job<{ articleId: UUID }>) => {
    const article = await dbAdapter.getArticleById(job.payload.articleId);

    if (!article || !article.toDelete) {
      return;
    }

    await article.destroy();
  });
}
