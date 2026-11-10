import { dbAdapter, Job, JobManager } from '../models';
import type { UUID } from '../support/types';
import { UndoCommentDelete } from '../support/undo/comment-delete';

export const DELETE_COMMENT = 'DELETE_COMMENT';

export async function scheduleCommentDeletion(commentId: UUID) {
  await Job.create(
    DELETE_COMMENT,
    { commentId },
    {
      uniqKey: commentId,
      unlockAt: UndoCommentDelete.ttlSec,
    },
  );
}

export function initHandlers(jobManager: JobManager) {
  jobManager.on(DELETE_COMMENT, async (job: Job<{ commentId: UUID }>) => {
    const comment = await dbAdapter.getCommentById(job.payload.commentId);

    if (!comment || !comment.toDelete) {
      return;
    }

    await comment.destroy();
  });
}
