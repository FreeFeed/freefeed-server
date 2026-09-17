import { dbAdapter, Job, JobManager } from '../models';
import type { UUID } from '../support/types';
import { UndoPostDelete } from '../support/undo/post-delete';

export const DELETE_POST = 'DELETE_POST';

export async function schedulePostDeletion(postId: UUID) {
  await Job.create(
    DELETE_POST,
    { postId },
    {
      uniqKey: postId,
      unlockAt: UndoPostDelete.ttlSec,
    },
  );
}

export function initHandlers(jobManager: JobManager) {
  jobManager.on(DELETE_POST, async (job: Job<{ postId: UUID }>) => {
    const post = await dbAdapter.getPostById(job.payload.postId);

    if (!post || !post.toDelete) {
      return;
    }

    await post.destroy();
  });
}
