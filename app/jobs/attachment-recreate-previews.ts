import createDebug from 'debug';

import type { UUID } from '../support/types';
import { dbAdapter, Job, JobManager } from '../models';

type Payload = { attId: UUID };

const debug = createDebug('freefeed:model:attachment');

export const ATTACHMENT_RECREATE_PREVIEWS = 'ATTACHMENT_RECREATE_PREVIEWS';

export async function createRecreatePreviewsJob(attId: UUID): Promise<void> {
  await Job.create(ATTACHMENT_RECREATE_PREVIEWS, { attId }, { uniqKey: attId });
}

export function initHandlers(jobManager: JobManager) {
  // Allow only one job at a time
  jobManager.limitedJobs[ATTACHMENT_RECREATE_PREVIEWS] = 1;

  jobManager.on(ATTACHMENT_RECREATE_PREVIEWS, async (job: Job<Payload>) => {
    const { attId } = job.payload;
    const att = await dbAdapter.getAttachmentById(attId);

    if (!att) {
      debug(`${job.name}: the attachment ${attId} does not exist`);
      return;
    }

    if (!att.isLegacyImage) {
      debug(`${job.name}: the attachment ${attId} is not a legacy image`);
      return;
    }

    await att.recreatePreviews();
  });
}
